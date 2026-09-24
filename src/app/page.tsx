import { LandingPage } from "@/components/landing-page";
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
  const account =
    user?.email_confirmed_at && user.email ? { email: user.email } : null;
  return <LandingPage account={account} />;
}
