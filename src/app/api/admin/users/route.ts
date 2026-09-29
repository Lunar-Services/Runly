import { z } from "zod";
import {
  adminClient,
  adminSession,
  ApiError,
  body,
  failure,
  sameOrigin,
} from "@/lib/api";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suspend"),
    userId: z.string().uuid(),
    suspended: z.boolean(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal("reset-limits"), userId: z.string().uuid() }),
  z.object({
    action: z.literal("extra-tokens"),
    userId: z.string().uuid(),
    extraTokens: z.number().int().min(0).max(1_000_000_000),
  }),
  z.object({
    action: z.literal("role"),
    userId: z.string().uuid(),
    admin: z.boolean(),
  }),
  z.object({
    action: z.literal("assign-plan"),
    userId: z.string().uuid(),
    planId: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  }),
]);

export async function GET() {
  try {
    await adminSession();
    const db = adminClient();
    const [auth, profiles, roles, controls, entitlements, plans] =
      await Promise.all([
        db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        db.from("profiles").select("id,display_name,created_at"),
        db.from("account_roles").select("user_id,role"),
        db.from("ai_user_controls").select("*"),
        db
          .from("plan_entitlements")
          .select("user_id,plan_id,active")
          .eq("active", true),
        db
          .from("subscription_plans")
          .select("id,name,active,price_cents")
          .order("price_cents", { ascending: true }),
      ]);
    if (
      auth.error ||
      profiles.error ||
      roles.error ||
      controls.error ||
      entitlements.error ||
      plans.error
    )
      throw new ApiError(
        503,
        "Couldn't load users. Apply the latest database migration and retry.",
      );
    const profileMap = new Map(
      (profiles.data || []).map((item) => [item.id, item]),
    );
    const roleMap = new Map(
      (roles.data || []).map((item) => [item.user_id, item.role]),
    );
    const controlMap = new Map(
      (controls.data || []).map((item) => [item.user_id, item]),
    );
    const planMap = new Map(
      (entitlements.data || [])
        .filter((item) => item.user_id)
        .map((item) => [item.user_id as string, item.plan_id]),
    );
    return Response.json(
      {
        users: auth.data.users.map((user) => ({
          id: user.id,
          email: user.email,
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at,
          displayName: profileMap.get(user.id)?.display_name || "",
          role: roleMap.get(user.id) || "user",
          plan: planMap.get(user.id) || null,
          ...controlMap.get(user.id),
        })),
        plans: plans.data || [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const { user: actor } = await adminSession();
    const parsed = actionSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new ApiError(400, "Choose a valid user action.");
    const db = adminClient();
    const input = parsed.data;
    if (input.action === "role") {
      if (input.userId === actor.id && !input.admin)
        throw new ApiError(409, "You can't remove your own admin access.");
      const result = input.admin
        ? await db
            .from("account_roles")
            .upsert(
              { user_id: input.userId, role: "admin" },
              { onConflict: "user_id" },
            )
        : await db
            .from("account_roles")
            .update({ role: "user" })
            .eq("user_id", input.userId)
            .eq("role", "admin");
      if (result.error)
        throw new ApiError(502, "Couldn't update this user's role.");
    } else if (input.action === "assign-plan") {
      const { data: plan, error: planError } = await db
        .from("subscription_plans")
        .select("id,name")
        .eq("id", input.planId)
        .maybeSingle();
      if (planError) throw new ApiError(502, "Couldn't verify this plan.");
      if (!plan) throw new ApiError(404, "This plan no longer exists.");

      const { data: entitlement, error: entitlementError } = await db
        .from("plan_entitlements")
        .select("id")
        .eq("user_id", input.userId)
        .eq("active", true)
        .maybeSingle();
      if (entitlementError)
        throw new ApiError(502, "Couldn't check the user's current plan.");

      const result = entitlement
        ? await db
            .from("plan_entitlements")
            .update({ plan_id: plan.id, active: true, ends_at: null })
            .eq("id", entitlement.id)
            .eq("user_id", input.userId)
        : await db.from("plan_entitlements").insert({
            user_id: input.userId,
            plan_id: plan.id,
            active: true,
            starts_at: new Date().toISOString(),
            ends_at: null,
          });
      if (result.error)
        throw new ApiError(502, "Couldn't grant this plan to the user.");
    } else {
      const values =
        input.action === "suspend"
          ? {
              suspended: input.suspended,
              suspension_reason: input.suspended ? input.reason || null : null,
            }
          : input.action === "reset-limits"
            ? { limit_reset_at: new Date().toISOString() }
            : { extra_tokens: input.extraTokens };
      const { error } = await db.from("ai_user_controls").upsert(
        {
          user_id: input.userId,
          ...values,
          updated_by: actor.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error)
        throw new ApiError(502, "Couldn't update AI access for this user.");
    }
    await db.from("audit_logs").insert({
      actor_id: actor.id,
      action: `admin.user.${input.action}`,
      target_type: "user",
      target_id: input.userId,
      metadata: input,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
