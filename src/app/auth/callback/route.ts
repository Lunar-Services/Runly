import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") === "/reset-password" ? "/reset-password" : "/dashboard";
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.redirect(new URL("/login?error=unavailable", url.origin));
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", url.origin));
}
