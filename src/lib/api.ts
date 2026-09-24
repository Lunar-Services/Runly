import { createServerSupabaseClient } from "./supabase/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError(503, "This service is temporarily unavailable.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function session() {
  const db = await createServerSupabaseClient();
  if (!db) { console.error("Runly setup: Supabase URL and publishable key are missing. See SETUP.md."); throw new ApiError(503, "Accounts are temporarily unavailable. Please try again later."); }
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new ApiError(401, "Sign in to continue.");
  if (!data.user.email_confirmed_at) throw new ApiError(403, "Verify your email before continuing.");
  return { db, user: data.user };
}
export async function ownerSession() {
  const value = await session();
  const { data, error } = await value.db.from("platform_owners").select("user_id").eq("user_id", value.user.id).maybeSingle();
  if (error || !data) throw new ApiError(403, "This page is only available to the platform owner.");
  return value;
}
export function sameOrigin(request: Request) {
  const expected = process.env.RUNLY_SITE_URL ? new URL(process.env.RUNLY_SITE_URL).origin : new URL(request.url).origin;
  if (request.headers.get("origin") !== expected) throw new ApiError(403, "This request could not be verified. Reload the page and try again.");
}
export function appOrigin(request: Request) {
  if (process.env.RUNLY_SITE_URL) return new URL(process.env.RUNLY_SITE_URL).origin;
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new ApiError(503, "This service is temporarily unavailable.");
  return url.origin;
}
export async function body(request: Request, max = 250_000) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "Send a JSON request.");
  const text = await request.text();
  if (Buffer.byteLength(text) > max) throw new ApiError(413, "This request is too large.");
  try { return JSON.parse(text); } catch { throw new ApiError(400, "The request could not be read."); }
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return Response.json({ message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  console.error("Runly request failed", error instanceof Error ? error.name : "Unknown error");
  return Response.json({ message: "Something went wrong. Please try again." }, { status: 500 });
}

// An additional per-process guard for localhost; hosted deployments require the shared database limiter.
const localBuckets = new Map<string, { count: number; until: number }>();
export async function rateLimit(_request: Request, scope: string, userId = "", limit = 30) {
  const key = createHash("sha256").update(`${scope}:${userId || "anonymous"}`).digest("hex");
  if (process.env.RUNLY_SITE_URL && !new URL(process.env.RUNLY_SITE_URL).hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
    const { data, error } = await adminClient().rpc("consume_request_limit", { p_key: key, p_limit: limit, p_seconds: 60 });
    if (error) throw new ApiError(503, "Please try again shortly.");
    if (!data) throw new ApiError(429, "Too many requests. Please wait a minute.");
    return;
  }
  const now = Date.now();
  if (localBuckets.size > 5000) for (const [id, entry] of localBuckets) if (entry.until < now) localBuckets.delete(id);
  const bucket = localBuckets.get(key);
  if (!bucket || bucket.until < now) localBuckets.set(key, { count: 1, until: now + 60_000 });
  else if (++bucket.count > limit) throw new ApiError(429, "Too many requests. Please wait a minute.");
}
