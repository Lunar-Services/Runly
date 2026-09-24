import { LandingPage } from "@/components/landing-page";
import { redirect } from "next/navigation";

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  // Supabase can fall back to its configured Site URL after email verification.
  if (typeof code === "string" && code.length <= 2048) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  return <LandingPage />;
}
