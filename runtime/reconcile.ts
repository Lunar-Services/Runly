// Operator-only recovery of an uncertain task. Never resubmits model input.
// Pass a turn ID only after inspecting the provider session and matching the job.
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { combinedUsage } from "../src/lib/chat-media";
import { z } from "zod";
import { digest } from "../src/lib/runtime/shared";

const jobId = z.string().uuid().parse(process.argv[2]);
const suppliedTurn = process.argv[3];
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const openai = new OpenAI({ maxRetries: 0 });
async function checked<T>(
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
const job = await checked(
  db.from("runtime_jobs").select("*").eq("id", jobId).single(),
);
if (!job || job.state !== "failed")
  throw new Error(
    "Only failed tasks can be reconciled. Wait for the worker lease to expire first.",
  );
if (!job.provider_submitted) {
  if (job.reservation_id)
    await checked(
      db
        .from("usage_reservations")
        .update({ status: "released" })
        .eq("id", job.reservation_id)
        .eq("status", "reserved"),
    );
  console.log("No provider submission was attempted; reservation released.");
} else {
  const runtime = await checked(
    db
      .from("project_runtimes")
      .select("session_id")
      .eq("project_id", job.project_id)
      .single(),
  );
  const turnId = job.provider_turn_id || suppliedTurn;
  if (!runtime?.session_id || !turnId)
    throw new Error(
      "Inspect this job's provider session, then supply its matching turn ID. Do not release usage blindly.",
    );
  const turn = await openai.beta.agents.sessions.turns.retrieve(turnId, {
    session_id: runtime.session_id,
  });
  if (
    turn.subagent_id ||
    !["completed", "failed", "cancelled"].includes(turn.status) ||
    !turn.usage
  )
    throw new Error(
      "The root turn must be finished and have reported usage before reconciliation.",
    );
  await checked(
    db.rpc("settle_runtime_usage", {
      p_job: job.id,
      p_input: combinedUsage(turn.usage, job.usage || {}).input_tokens,
      p_output: combinedUsage(turn.usage, job.usage || {}).output_tokens,
      p_turn: turnId,
    }),
  );
  if (turn.status === "completed" && job.conversation_id) {
    const answers: string[] = [];
    for await (const item of openai.beta.agents.sessions.items.list(
      runtime.session_id,
      { order: "desc", limit: 100 },
    )) {
      if (item.turn_id !== turnId) continue;
      if (
        item.type === "message" &&
        item.role === "assistant" &&
        item.phase === "final_answer"
      )
        answers.unshift(
          item.content
            .map((part) => ("text" in part ? part.text : ""))
            .join(""),
        );
    }
    if (answers.length) {
      const assistantId = digest(`assistant:${job.id}`)
        .slice(0, 32)
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
      await checked(
        db.from("messages").upsert(
          {
            id: assistantId,
            conversation_id: job.conversation_id,
            role: "assistant",
            body: answers.join("\n\n").slice(0, 50000),
          },
          { onConflict: "id", ignoreDuplicates: true },
        ),
      );
    }
  }
  await checked(
    db
      .from("runtime_jobs")
      .update({
        provider_turn_id: turnId,
        usage: combinedUsage(turn.usage, job.usage || {}),
        state: turn.status === "completed" ? "completed" : "failed",
        error:
          turn.status === "completed"
            ? null
            : `Provider task ${turn.status}; usage reconciled.`,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id),
  );
  console.log(
    `Task reconciled (${turn.status}). Inspect project files before continuing.`,
  );
}
