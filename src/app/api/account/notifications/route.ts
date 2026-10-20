import { z } from "zod";
import {
  ApiError,
  auditAction,
  body,
  failure,
  sameOrigin,
  session,
} from "@/lib/api";

const preferences = z.object({
  projectUpdates: z.boolean(),
  teamActivity: z.boolean(),
  productUpdates: z.boolean(),
  tipsAndInspiration: z.boolean(),
  securityAlerts: z.literal(true),
  billingAlerts: z.literal(true),
});

const preferenceInput = preferences
  .omit({ securityAlerts: true, billingAlerts: true })
  .strict();
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const { db, user } = await session();
    const { data, error } = await db
      .from("profiles")
      .select("notification_preferences")
      .eq("id", user.id)
      .single();
    const saved = preferences.safeParse(data?.notification_preferences);
    if (error || !saved.success)
      throw new ApiError(502, "Couldn't load your notification preferences.");
    return Response.json(saved.data, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    const input = preferenceInput.safeParse(await body(request, 1024));
    if (!input.success)
      throw new ApiError(
        400,
        "Check your notification preferences and try again.",
      );
    // Security and billing notices are essential account communications.
    // This endpoint stores preferences; it does not send email.
    const next = {
      ...input.data,
      securityAlerts: true as const,
      billingAlerts: true as const,
    };
    const { data, error } = await db
      .from("profiles")
      .update({
        notification_preferences: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("notification_preferences")
      .single();
    const saved = preferences.safeParse(data?.notification_preferences);
    if (error || !saved.success)
      throw new ApiError(
        502,
        "Your notification preferences couldn't be saved.",
      );
    await auditAction(user.id, "account.notifications_updated", next);
    return Response.json(
      { ...saved.data, message: "Notification preferences saved." },
      { headers: noStore },
    );
  } catch (error) {
    return failure(error);
  }
}
