import { z } from "zod";
import {
  adminClient,
  ApiError,
  body,
  failure,
  sameOrigin,
  session,
} from "@/lib/api";

const profileInput = z.object({
  displayName: z.string().trim().min(1).max(120),
});

async function avatarUrl(
  avatarPath: string | null,
  legacyAvatarUrl: string | null,
) {
  if (!avatarPath) return legacyAvatarUrl || "";
  const { data, error } = await adminClient()
    .storage.from("profile-avatars")
    .createSignedUrl(avatarPath, 60 * 60);
  return error ? "" : data.signedUrl;
}

export async function GET() {
  try {
    const { db, user } = await session();
    const { data, error } = await db
      .from("profiles")
      .select("display_name,avatar_url,avatar_path")
      .eq("id", user.id)
      .single();
    if (error)
      throw new ApiError(502, "Couldn't load your account. Try again.");
    const { data: role } = await db
      .from("account_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    return Response.json(
      {
        email: user.email,
        displayName: data.display_name || "",
        avatarUrl: await avatarUrl(data.avatar_path, data.avatar_url),
        role: role?.role === "admin" ? "admin" : "user",
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
    const { db, user } = await session();
    const input = profileInput.safeParse(await body(request, 4096));
    if (!input.success)
      throw new ApiError(
        400,
        input.error.issues[0]?.message ||
          "Check your profile details and try again.",
      );
    const { error } = await db
      .from("profiles")
      .update({
        display_name: input.data.displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error?.code === "23505")
      throw new ApiError(409, "That display name is already in use.");
    if (error)
      throw new ApiError(502, "Your changes couldn't be saved. Try again.");
    return Response.json({ message: "Account updated." });
  } catch (error) {
    return failure(error);
  }
}
