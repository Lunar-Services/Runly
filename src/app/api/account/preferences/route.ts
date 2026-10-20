import { z } from "zod";
import {
  adminClient,
  ApiError,
  body,
  failure,
  rateLimit,
  sameOrigin,
  session,
} from "@/lib/api";
const preferenceSchema = z
  .object({ theme: z.enum(["light", "dark", "system"]) })
  .strict();
export async function GET() {
  try {
    const { db, user } = await session();
    const { data, error } = await db
      .from("profiles")
      .select("theme")
      .eq("id", user.id)
      .single();
    if (error) throw new ApiError(502, "Couldn't load account preferences.");
    return Response.json(preferenceSchema.parse(data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    await rateLimit(request, "account-preferences", user.id, 30);
    const input = preferenceSchema.parse(await body(request, 1024));
    const { data, error } = await db
      .from("profiles")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("theme")
      .single();
    if (error) throw new ApiError(502, "Couldn't save account preferences.");
    const { error: auditError } = await adminClient()
      .from("audit_events")
      .insert({
        actor_id: user.id,
        action: "account.preferences_updated",
        metadata: input,
      });
    if (auditError)
      throw new ApiError(
        502,
        "Your preferences were saved but couldn't be recorded. Please reload.",
      );
    return Response.json(preferenceSchema.parse(data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
