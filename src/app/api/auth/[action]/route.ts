import { z } from "zod";
import {
  ApiError,
  appOrigin,
  body,
  failure,
  rateLimit,
  safeAppPath,
  sameOrigin,
  session,
} from "@/lib/api";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  accepted: z.boolean().optional(),
  next: z.string().max(2048).optional(),
});
let oauthSettings: {
  url: string;
  expires: number;
  providers: Record<string, boolean>;
} | null = null;
async function enabledOAuthProvider(provider: "google" | "github") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new ApiError(503, "Sign-in is temporarily unavailable.");
  if (
    !oauthSettings ||
    oauthSettings.url !== url ||
    oauthSettings.expires <= Date.now()
  ) {
    try {
      const response = await fetch(new URL("/auth/v1/settings", url), {
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Auth settings unavailable");
      const settings = z
        .object({ external: z.record(z.string(), z.boolean()) })
        .parse(await response.json());
      oauthSettings = {
        url,
        expires: Date.now() + 5 * 60 * 1000,
        providers: settings.external,
      };
    } catch {
      throw new ApiError(
        503,
        "We couldn't check sign-in availability. Please try email sign-in.",
      );
    }
  }
  if (!oauthSettings.providers[provider])
    throw new ApiError(
      503,
      `${provider === "google" ? "Google" : "GitHub"} sign-in has not been configured. Please use email sign-in.`,
    );
}
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    sameOrigin(request);
    const { action } = await context.params;
    if (
      ![
        "login",
        "signup",
        "verify",
        "resend",
        "logout",
        "mfa",
        "forgot",
        "reset",
        "github",
        "google",
        "email",
      ].includes(action)
    )
      throw new ApiError(404, "Unknown action.");
    await rateLimit(
      request,
      `auth-global:${action}`,
      "",
      action === "forgot" || action === "resend" ? 120 : 300,
    );
    const db = await createServerSupabaseClient();
    if (!db) {
      console.error(
        "Runly setup: configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.",
      );
      throw new ApiError(
        503,
        "Accounts are temporarily unavailable. Please try again later.",
      );
    }
    const origin = appOrigin(request);
    if (action === "logout") {
      const { error } = await db.auth.signOut();
      if (error)
        throw new ApiError(502, "Couldn't sign out. Please try again.");
      return Response.json({ message: "Signed out." });
    }
    if (action === "github" || action === "google") {
      const input = z
        .object({
          signup: z.boolean().optional(),
          accepted: z.boolean().optional(),
          next: z.string().max(2048).optional(),
          fullName: z.string().trim().max(120).optional(),
        })
        .parse(await body(request, 4096));
      if (input.signup && input.accepted !== true)
        throw new ApiError(
          400,
          "Please accept the Terms and acknowledge the Privacy Policy.",
        );
      await enabledOAuthProvider(action);
      const { data, error } = await db.auth.signInWithOAuth({
        provider: action,
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeAppPath(input.next))}`,
        },
      });
      if (error || !data.url)
        throw new ApiError(
          503,
          `${action === "google" ? "Google" : "GitHub"} sign-in is unavailable. Please try email sign-in.`,
        );
      return Response.json({ url: data.url });
    }
    const input = await body(request, 4096);
    if (action === "mfa") {
      const { db: authDb, user } = await session({ allowMfaPending: true });
      await rateLimit(request, "auth-mfa", user.id, 8);
      const parsed = z
        .object({
          factorId: z.string().uuid(),
          code: z
            .string()
            .trim()
            .regex(/^\d{6}$/),
          next: z.string().max(2048).optional(),
        })
        .strict()
        .safeParse(input);
      if (!parsed.success)
        throw new ApiError(400, "Enter the six-digit authenticator code.");
      const { data: factors, error: factorsError } =
        await authDb.auth.mfa.listFactors();
      const factor = factors?.all.find(
        (entry) =>
          entry.id === parsed.data.factorId &&
          entry.factor_type === "totp" &&
          entry.status === "verified",
      );
      if (factorsError || !factor)
        throw new ApiError(400, "That authenticator is no longer available.");
      const { error } = await authDb.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: parsed.data.code,
      });
      if (error)
        throw new ApiError(
          400,
          "That code couldn't be verified. Check it and try again.",
        );
      return Response.json(
        {
          message: "Two-step verification complete.",
          redirect: safeAppPath(parsed.data.next),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    // A tiny shared anonymous bucket let one caller lock everyone out. Keep a
    // coarse global ceiling, then limit expensive email flows by subject.
    if (typeof input?.email === "string")
      await rateLimit(
        request,
        `auth-email:${action}`,
        input.email.trim().toLowerCase(),
        action === "forgot" || action === "resend" ? 3 : 10,
      );
    if (action === "email") {
      const parsed = z
        .object({
          email: z.email().max(254),
          signup: z.boolean().optional(),
          accepted: z.boolean().optional(),
          next: z.string().max(2048).optional(),
          fullName: z.string().trim().max(120).optional(),
        })
        .strict()
        .safeParse(input);
      if (!parsed.success)
        throw new ApiError(400, "Enter a valid email address.");
      if (parsed.data.signup && !parsed.data.accepted)
        throw new ApiError(
          400,
          "Please accept the Terms and acknowledge the Privacy Policy.",
        );
      const { error } = await db.auth.signInWithOtp({
        email: parsed.data.email,
        options: {
          shouldCreateUser: parsed.data.signup === true,
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeAppPath(parsed.data.next))}`,
          ...(parsed.data.signup
            ? {
                data: {
                  legal_accepted_at: new Date().toISOString(),
                  full_name: parsed.data.fullName || "",
                },
              }
            : {}),
        },
      });
      if (error?.status === 429)
        throw new ApiError(
          429,
          "Please wait a minute before requesting another code.",
        );
      if (
        error &&
        error.code !== "otp_disabled" &&
        error.code !== "user_not_found"
      )
        throw new ApiError(
          503,
          "Email sign-in is temporarily unavailable. Please try again later.",
        );
      return Response.json(
        {
          message:
            "If this address can sign in, a verification code is on its way.",
          redirect: `/verify-email?flow=email&next=${encodeURIComponent(safeAppPath(parsed.data.next))}`,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (action === "verify") {
      const parsed = z
        .object({
          email: z.email().max(254).optional(),
          code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
          token_hash: z.string().min(20).max(512).optional(),
          next: z.string().max(2048).optional(),
        })
        .refine((value) => value.token_hash || (value.email && value.code))
        .safeParse(input);
      if (!parsed.success)
        throw new ApiError(400, "Enter the six-digit code from your email.");
      const { data, error } = parsed.data.token_hash
        ? await db.auth.verifyOtp({
            token_hash: parsed.data.token_hash,
            type: "email",
          })
        : await db.auth.verifyOtp({
            email: parsed.data.email!,
            token: parsed.data.code!,
            type: "email",
          });
      if (error || !data.session || !data.user?.email_confirmed_at)
        throw new ApiError(
          400,
          "That code is invalid or has expired. Request a new code and try again.",
        );
      const { data: assurance, error: assuranceError } =
        await db.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError)
        throw new ApiError(
          503,
          "We couldn't verify your sign-in security. Please try again.",
        );
      const needsMfa =
        assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2";
      const next = safeAppPath(parsed.data.next);
      return Response.json({
        message: "Email verified.",
        redirect: needsMfa
          ? `/verify-mfa?next=${encodeURIComponent(next)}`
          : next,
      });
    }
    if (action === "resend") {
      const parsed = z.object({ email: z.email().max(254) }).safeParse(input);
      if (!parsed.success)
        throw new ApiError(
          400,
          "Enter the email address you used to create your account.",
        );
      const { error } = await db.auth.resend({
        type: "signup",
        email: parsed.data.email,
      });
      if (
        error?.code === "over_email_send_rate_limit" ||
        error?.code === "over_request_rate_limit"
      )
        throw new ApiError(
          429,
          "Please wait a minute before requesting another code.",
        );
      if (error)
        throw new ApiError(
          503,
          "A new code could not be sent. Please try again later.",
        );
      return Response.json({ message: "A new six-digit code is on its way." });
    }
    if (action === "forgot") {
      const parsed = z.object({ email: z.email().max(254) }).safeParse(input);
      if (!parsed.success)
        throw new ApiError(400, "Enter a valid email address.");
      const { error } = await db.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      });
      if (error)
        throw new ApiError(
          503,
          "Reset emails are temporarily unavailable. Try again later.",
        );
      return Response.json({
        message:
          "If an account exists for that address, a reset link is on its way.",
      });
    }
    if (action === "reset") {
      const { db: resetDb, user } = await session();
      await rateLimit(request, "auth-reset", user.id, 5);
      const parsed = z
        .object({ password: z.string().min(8).max(128) })
        .safeParse(input);
      if (!parsed.success)
        throw new ApiError(400, "Use a password between 8 and 128 characters.");
      const { error } = await resetDb.auth.updateUser({
        password: parsed.data.password,
      });
      if (error)
        throw new ApiError(
          400,
          "Couldn't update the password. Request a new reset link and try again.",
        );
      await resetDb.auth.signOut({ scope: "global" });
      return Response.json({
        message: "Password updated. Sign in with your new password.",
        redirect: "/login",
      });
    }
    const parsed = credentials.safeParse(input);
    if (!parsed.success)
      throw new ApiError(
        400,
        "Enter a valid email and a password between 8 and 128 characters.",
      );
    if (action === "signup" && !parsed.data.accepted)
      throw new ApiError(
        400,
        "Please accept the Terms and acknowledge the Privacy Policy.",
      );
    const { email, password } = parsed.data;
    const result =
      action === "signup"
        ? await db.auth.signUp({
            email,
            password,
            options: { data: { legal_accepted_at: new Date().toISOString() } },
          })
        : await db.auth.signInWithPassword({ email, password });
    if (result.error) {
      const code = result.error.code;
      const errorText = result.error.message.toLowerCase();
      const message =
        code === "email_not_confirmed"
          ? "Enter the six-digit code Supabase emailed you before signing in."
          : code === "over_email_send_rate_limit" ||
              code === "over_request_rate_limit"
            ? "Please wait a minute before trying again."
            : code === "user_already_exists" ||
                code === "email_exists" ||
                errorText.includes("already registered")
              ? "An account already exists for this email. Sign in or request a new verification code."
              : errorText.includes("database error")
                ? process.env.RUNLY_LOCAL_SUPABASE === "true"
                  ? "Supabase could not create the account. Reset the local database and run the app again."
                  : "Supabase could not create the account. Please try again later."
                : action === "login"
                  ? "The email or password is incorrect."
                  : "Couldn't create the account. Try signing in if you already registered.";
      throw new ApiError(
        errorText.includes("database error") ? 503 : 400,
        message,
      );
    }
    if (action === "signup" && result.data.session) {
      await db.auth.signOut();
      console.error(
        "Runly setup: Supabase email confirmations must be enabled before account creation is available.",
      );
      throw new ApiError(
        503,
        "Email verification is temporarily unavailable. Please enable Supabase email confirmations and try again.",
      );
    }
    if (action === "login") {
      const next = safeAppPath(parsed.data.next);
      const { data: assurance, error: assuranceError } =
        await db.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError)
        throw new ApiError(
          503,
          "We couldn't verify your sign-in security. Please try again.",
        );
      const needsMfa =
        assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2";
      return Response.json({
        redirect: needsMfa
          ? `/verify-mfa?next=${encodeURIComponent(next)}`
          : next,
        message: needsMfa
          ? "Verify your authenticator to continue."
          : "Signed in.",
      });
    }
    return Response.json({
      message: "We emailed you a six-digit verification code.",
      redirect: "/verify-email",
    });
  } catch (error) {
    return failure(error);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await context.params;
    if (action !== "mfa") throw new ApiError(404, "Unknown action.");
    const { db } = await session({ allowMfaPending: true });
    const { data, error } = await db.auth.mfa.listFactors();
    if (error) throw new ApiError(502, "Couldn't load authenticator options.");
    const factors = (data?.all ?? [])
      .filter(
        (factor) =>
          factor.factor_type === "totp" && factor.status === "verified",
      )
      .map((factor) => ({
        id: factor.id,
        name: factor.friendly_name || "Authenticator app",
      }));
    if (!factors.length)
      throw new ApiError(
        403,
        "No verified authenticator is available for this account.",
      );
    return Response.json(
      { factors },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
