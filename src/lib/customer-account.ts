import "server-only";
import { adminClient } from "./api";
import { createServerSupabaseClient } from "./supabase/server";

export async function customerAccount() {
  const db = await createServerSupabaseClient();
  if (!db) return null;
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user?.email_confirmed_at || !user.email) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("display_name,avatar_url,avatar_path")
    .eq("id", user.id)
    .maybeSingle();
  let avatarUrl = profile?.avatar_url || "";
  if (profile?.avatar_path) {
    try {
      const { data } = await adminClient()
        .storage.from("profile-avatars")
        .createSignedUrl(profile.avatar_path, 3600);
      avatarUrl = data?.signedUrl || "";
    } catch {
      /* The public page remains usable when storage is unavailable. */
    }
  }
  return {
    email: user.email,
    displayName: profile?.display_name || "",
    avatarUrl,
  };
}
