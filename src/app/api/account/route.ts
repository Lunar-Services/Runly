import { z } from "zod";
import { ApiError, body, failure, sameOrigin, session } from "@/lib/api";

const profileInput = z.object({
  displayName: z.string().trim().min(1).max(120),
  avatarUrl: z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try { return ["http:", "https:"].includes(new URL(value).protocol); }
    catch { return false; }
  }, "Use a valid http or https image URL."),
});

export async function GET() {
  try {
    const { db, user } = await session();
    const { data, error } = await db.from("profiles").select("display_name,avatar_url").eq("id", user.id).single();
    if (error) throw new ApiError(502, "Couldn't load your account. Try again.");
    return Response.json({ email: user.email, displayName: data.display_name || "", avatarUrl: data.avatar_url || "" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    const input = profileInput.safeParse(await body(request, 4096));
    if (!input.success) throw new ApiError(400, input.error.issues[0]?.message || "Check your profile details and try again.");
    const { error } = await db.from("profiles").update({ display_name: input.data.displayName, avatar_url: input.data.avatarUrl || null, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (error) throw new ApiError(502, "Your changes couldn't be saved. Try again.");
    return Response.json({ message: "Account updated." });
  } catch (error) { return failure(error); }
}
