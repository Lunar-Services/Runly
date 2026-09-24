import { LandingPage } from "@/components/landing-page";
import { adminClient } from "@/lib/api";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  // Supabase can fall back to its configured Site URL after email verification.
  if (typeof code === "string" && code.length <= 2048)
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: profile } =
    user && supabase
      ? await supabase
          .from("profiles")
          .select("display_name,avatar_url,avatar_path")
          .eq("id", user.id)
          .maybeSingle()
      : { data: null };
  let signedAvatarUrl = "";
  if (profile?.avatar_path) {
    try {
      const { data } = await adminClient()
        .storage.from("profile-avatars")
        .createSignedUrl(profile.avatar_path, 60 * 60);
      signedAvatarUrl = data?.signedUrl || "";
    } catch {
      // A missing server role key must not prevent the public landing page.
    }
  }
  const account =
    user?.email_confirmed_at && user.email
      ? {
          email: user.email,
          displayName: profile?.display_name || "",
          avatarUrl: signedAvatarUrl || profile?.avatar_url || "",
        }
      : null;
  return <LandingPage account={account} />;
}
