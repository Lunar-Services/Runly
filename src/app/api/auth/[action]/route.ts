import { z } from "zod";
import { ApiError, appOrigin, body, failure, rateLimit, sameOrigin, session } from "@/lib/api";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const credentials = z.object({ email: z.email().max(254), password: z.string().min(8).max(128), accepted: z.boolean().optional() });
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    sameOrigin(request);
    const { action } = await context.params;
    if (!["login", "signup", "verify", "logout", "forgot", "reset", "github"].includes(action)) throw new ApiError(404, "Unknown action.");
    await rateLimit(request, `auth:${action}`, "", action === "forgot" ? 3 : 10);
    const db = await createServerSupabaseClient();
    if (!db) { console.error("Runly setup: configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local."); throw new ApiError(503, "Accounts are temporarily unavailable. Please try again later."); }
    const origin = appOrigin(request);
    if (action === "logout") {
      const { error } = await db.auth.signOut();
      if (error) throw new ApiError(502, "Couldn't sign out. Please try again.");
      return Response.json({ message: "Signed out." });
    }
    if (action === "github") {
      const input = await body(request);
      if (input.signup && input.accepted !== true) throw new ApiError(400, "Please accept the Terms and acknowledge the Privacy Policy.");
      const { data, error } = await db.auth.signInWithOAuth({ provider: "github", options: { redirectTo: `${origin}/auth/callback` } });
      if (error || !data.url) throw new ApiError(503, "GitHub sign-in is unavailable. Please try email sign-in.");
      return Response.json({ url: data.url });
    }
    const input = await body(request, 4096);
    if (action === "verify") {
      const parsed = z.object({ email: z.email().max(254), code: z.string().regex(/^\d{6}$/) }).safeParse(input);
      if (!parsed.success) throw new ApiError(400, "Enter the six-digit code from your email.");
      const { error } = await db.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "email" });
      if (error) throw new ApiError(400, "That code is invalid or has expired. Request a new code and try again.");
      return Response.json({ message: "Email verified.", redirect: "/dashboard" });
    }
    if (action === "forgot") {
      const parsed = z.object({ email: z.email().max(254) }).safeParse(input);
      if (!parsed.success) throw new ApiError(400, "Enter a valid email address.");
      const { error } = await db.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
      if (error) throw new ApiError(503, "Reset emails are temporarily unavailable. Try again later.");
      return Response.json({ message: "If an account exists for that address, a reset link is on its way." });
    }
    if (action === "reset") {
      await session();
      const parsed = z.object({ password: z.string().min(8).max(128) }).safeParse(input);
      if (!parsed.success) throw new ApiError(400, "Use a password between 8 and 128 characters.");
      const { error } = await db.auth.updateUser({ password: parsed.data.password });
      if (error) throw new ApiError(400, "Couldn't update the password. Request a new reset link and try again.");
      await db.auth.signOut({ scope: "global" });
      return Response.json({ message: "Password updated. Sign in with your new password.", redirect: "/login" });
    }
    const parsed = credentials.safeParse(input);
    if (!parsed.success) throw new ApiError(400, "Enter a valid email and a password between 8 and 128 characters.");
    if (action === "signup" && !parsed.data.accepted) throw new ApiError(400, "Please accept the Terms and acknowledge the Privacy Policy.");
    const { email, password } = parsed.data;
    const result = action === "signup"
      ? await db.auth.signUp({ email, password, options: { data: { legal_accepted_at: new Date().toISOString() } } })
      : await db.auth.signInWithPassword({ email, password });
    if (result.error) {
      const code = result.error.code;
      const message = code === "email_not_confirmed" ? "Enter the six-digit code Supabase emailed you before signing in." : code === "over_email_send_rate_limit" || code === "over_request_rate_limit" ? "Please wait a minute before trying again." : action === "login" ? "The email or password is incorrect." : "Couldn't create the account. Try signing in if you already registered.";
      throw new ApiError(400, message);
    }
    return Response.json(action === "login" ? { redirect: "/dashboard", message: "Signed in." } : { message: "Supabase has emailed a six-digit verification code.", redirect: result.data.session ? "/dashboard" : "/verify-email" });
  } catch (error) { return failure(error); }
}
