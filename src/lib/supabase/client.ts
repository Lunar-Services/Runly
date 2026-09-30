import { createBrowserClient } from "@supabase/ssr";
import { authCookieOptions } from "./auth-cookie";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key, { cookieOptions: authCookieOptions });
}
