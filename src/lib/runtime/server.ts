import "server-only";
import { z } from "zod";
import { ApiError, adminClient, session } from "@/lib/api";
import { gateways, gatewayFor, signTicket } from "./shared";
import { reconcileUserBilling } from "@/lib/billing";

export async function runtimeAccess(projectId: string) {
  if (!z.string().uuid().safeParse(projectId).success)
    throw new ApiError(400, "Invalid project.");
  const { db, user } = await session();
  const { data, error } = await db
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new ApiError(502, "Couldn't load this project.");
  if (!data) throw new ApiError(404, "Project not found.");
  return { db, user };
}
export function runtimeConfigured() {
  if (
    !process.env.RUNLY_RUNTIME_SECRET ||
    process.env.RUNLY_RUNTIME_SECRET.length < 32 ||
    !process.env.OPENAI_API_KEY ||
    !process.env.OPENAI_MODEL
  )
    throw new ApiError(503, "The project runtime has not been configured yet.");
  try {
    gateways();
  } catch {
    throw new ApiError(503, "The project runtime has not been configured yet.");
  }
}
export async function enqueueRuntime(
  project: string,
  actor: string,
  kind: "start" | "stop" | "agent",
  id: string,
  chat: string | null = null,
  input = "",
) {
  runtimeConfigured();
  if (kind !== "stop" && !(await reconcileUserBilling(actor)))
    throw new ApiError(503, "Billing verification is temporarily unavailable.");
  const { error } = await adminClient().rpc("enqueue_runtime_job", {
    p_id: id,
    p_project: project,
    p_actor: actor,
    p_gateway: gatewayFor(project).id,
    p_kind: kind,
    p_chat: chat,
    p_input: input,
  });
  if (error) {
    const messages: Record<string, string> = {
      queue_full:
        "This project has too many queued tasks. Wait for one to finish.",
      runtime_disabled:
        "An administrator needs to enable the runtime before it can be used.",
      no_entitlement:
        "An active project subscription is required to run a workspace.",
      quota_exhausted:
        "This project's AI allowance is used up or reserved by pending tasks.",
      daily_limit:
        "The runtime's daily safety limit has been reached. Try again later.",
      ai_suspended:
        "AI access for this account has been suspended by an administrator.",
    };
    const code = Object.keys(messages).find((key) =>
      error.message.includes(key),
    );
    throw new ApiError(
      code ? 429 : 409,
      code
        ? messages[code]
        : "Couldn't queue this task. Check the workspace and retry.",
    );
  }
}
export async function runtimeView(project: string, user: string) {
  const db = adminClient();
  const [{ data: runtime }, { data: files, error }, { data: jobs }] =
    await Promise.all([
      db
        .from("project_runtimes")
        .select("gateway_id,state,error")
        .eq("project_id", project)
        .maybeSingle(),
      db
        .from("runtime_files")
        .select("path,kind,content,hash")
        .eq("project_id", project)
        .order("path")
        .limit(1000),
      db
        .from("runtime_jobs")
        .select("id,kind,state,error,conversation_id")
        .eq("project_id", project)
        .in("state", ["queued", "running"])
        .order("created_at")
        .limit(8),
    ]);
  if (error)
    throw new ApiError(
      503,
      "Apply the project runtime database migration first.",
    );
  let connection = null;
  try {
    runtimeConfigured();
    const gateway = runtime
      ? gateways().find((g) => g.id === runtime.gateway_id)
      : gatewayFor(project);
    if (gateway)
      connection = {
        url: gateway.url,
        ticket: signTicket(
          { project, user, gateway: gateway.id, exp: Date.now() + 60_000 },
          process.env.RUNLY_RUNTIME_SECRET!,
        ),
      };
  } catch {
    /* Saved files remain readable when compute is disabled. */
  }
  return {
    mode: process.env.RUNLY_RUNTIME_MODE === "mock" ? "mock" : "openai",
    state: runtime?.state || "stopped",
    error: runtime?.error,
    files: files || [],
    jobs: jobs || [],
    connection,
  };
}
