import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOrigin(request);
  const code = url.searchParams.get("code");
  const requested = url.searchParams.get("next");
  const next =
    requested === "/reset-password" ||
    requested === "/settings" ||
    requested === "/settings/account"
      ? requested
      : "/dashboard";
  const supabase = await createServerSupabaseClient();
  if (!supabase)
    return NextResponse.redirect(new URL("/login?error=unavailable", origin));
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", origin),
  );
}
