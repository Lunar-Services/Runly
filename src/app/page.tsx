import { LandingPage } from "@/components/landing-page";
import { customerAccount } from "@/lib/customer-account";
import { redirect } from "next/navigation";
import type { SkyPhase } from "@/components/sky-background";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; sky?: string }>;
}) {
  const { code, sky } = await searchParams;
  const skyPreview =
    process.env.NODE_ENV === "development" &&
    ["dawn", "day", "sunset", "night"].includes(sky || "")
      ? (sky as SkyPhase)
      : undefined;
  // Supabase can fall back to its configured Site URL after email verification.
  if (typeof code === "string" && code.length <= 2048)
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  const account = await customerAccount();
  return <LandingPage account={account} skyPreview={skyPreview} />;
}
