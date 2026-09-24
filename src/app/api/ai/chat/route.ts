import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const RequestBody = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(12_000),
  idempotencyKey: z.string().uuid(),
});

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    return Response.json({ code: "provider_not_configured", message: "AI is not configured yet." }, { status: 503 });
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ code: "auth_not_configured", message: "Authentication is unavailable." }, { status: 503 });
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims?.claims?.sub) return Response.json({ code: "unauthorized", message: "Sign in to continue." }, { status: 401 });
  const parsed = RequestBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "invalid_request", message: "The request could not be validated." }, { status: 400 });

  const { data: reservation, error: reserveError } = await supabase.rpc("reserve_ai_usage", {
    p_project_id: parsed.data.projectId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_max_tokens: 8_000,
  });
  if (reserveError || !reservation) {
    return Response.json({ code: "quota_unavailable", message: "Usage could not be reserved. Try again later." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  try {
    const providerResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL, input: parsed.data.prompt, max_output_tokens: 4_000 }),
      signal: AbortSignal.timeout(90_000),
    });
    const providerBody = await providerResponse.json();
    if (!providerResponse.ok) throw new Error(`provider_${providerResponse.status}`);
    await supabase.rpc("settle_ai_usage", {
      p_reservation_id: reservation,
      p_input_tokens: providerBody.usage?.input_tokens ?? 0,
      p_output_tokens: providerBody.usage?.output_tokens ?? 0,
      p_provider_request_id: providerBody.id ?? null,
    });
    return Response.json({ id: providerBody.id, output: providerBody.output, usage: providerBody.usage });
  } catch {
    await supabase.rpc("release_ai_reservation", { p_reservation_id: reservation });
    return Response.json({ code: "provider_unavailable", message: "The AI provider is unavailable. Your project was not changed." }, { status: 503 });
  }
}
