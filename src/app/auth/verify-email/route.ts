import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/api";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOrigin(request);
  const tokenHash = url.searchParams.get("token_hash")?.slice(0, 512) || "";
  const email = url.searchParams.get("email")?.slice(0, 254) || "";
  const retry = new URL("/verify-email", origin);
  if (email) retry.searchParams.set("email", email);

  if (tokenHash.length < 20) return NextResponse.redirect(retry);

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.redirect(retry);

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  if (error || !data.session || !data.user?.email_confirmed_at)
    return NextResponse.redirect(retry);

  return NextResponse.redirect(new URL("/dashboard", origin));
}
