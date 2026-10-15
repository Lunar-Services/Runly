import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { appOrigin, safeAppPath } from "@/lib/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOrigin(request);
  const code = url.searchParams.get("code");
  const requested = url.searchParams.get("next");
  const next =
    requested === "/reset-password"
      ? requested
      : requested === "/settings/account"
        ? "/settings"
        : safeAppPath(requested);
  const supabase = await createServerSupabaseClient();
  if (!supabase)
    return NextResponse.redirect(new URL("/login?error=unavailable", origin));
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError)
        return NextResponse.redirect(
          new URL("/login?error=security_check_unavailable", origin),
        );
      if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2")
        return NextResponse.redirect(
          new URL(`/verify-mfa?next=${encodeURIComponent(next)}`, origin),
        );
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", origin),
  );
}
