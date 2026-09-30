import { z } from "zod";
import {
  adminClient,
  adminSession,
  ApiError,
  body,
  failure,
  sameOrigin,
} from "@/lib/api";

const actionSchema = z.object({
  action: z.literal("role"),
  userId: z.string().uuid(),
  admin: z.boolean(),
});

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
    if (!parsed.success)
      throw new ApiError(503, "Only administrator role changes are available.");
    const db = adminClient();
    const input = parsed.data;
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
