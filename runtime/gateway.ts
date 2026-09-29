import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket, WebSocketServer } from "ws";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";
import {
  digest,
  gateways,
  verifyTicket,
  validWorkspacePath,
} from "../src/lib/runtime/shared";

// A stable gateway ID is a shard. Existing projects keep their assignment when
// gateways are added. Run one active process per ID; use the proxy for TLS.
const gatewayId = process.env.RUNLY_RUNTIME_GATEWAY_ID || "primary";
if (
  process.env.NODE_ENV === "production" &&
  process.env.RUNLY_RUNTIME_MODE === "mock"
)
  throw new Error("Mock runtime is not allowed in production");
const gateway = gateways().find((entry) => entry.id === gatewayId);
const secret = process.env.RUNLY_RUNTIME_SECRET || "";
if (!gateway || secret.length < 32)
  throw new Error("Configure the runtime gateway and a 32+ character secret");
if (!process.env.OPENAI_MODEL) throw new Error("Configure OPENAI_MODEL");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const openai = new OpenAI({ maxRetries: 0, timeout: 60_000 });
const workerId = randomUUID();
const MAX_ACTIVE = Number(process.env.RUNLY_RUNTIME_MAX_ACTIVE || 10);
const IDLE_MS = Number(process.env.RUNLY_RUNTIME_IDLE_MINUTES || 5) * 60_000;
const TURN_MS = Number(process.env.RUNLY_AGENT_TIMEOUT_MINUTES || 10) * 60_000;
type Frame = Record<string, unknown> & { type: string };
type Job = {
  id: string;
  project_id: string;
  actor_id: string;
  conversation_id: string | null;
  input: string;
  kind: "start" | "stop" | "agent";
};
type File = {
  path: string;
  kind: "file" | "folder";
  content: string;
  hash: string;
};
type Room = {
  browsers: Set<WebSocket>;
  bridge?: WebSocket;
  generation?: string;
  history: string[];
  historySize: number;
  lastActive: number;
  busy: boolean;
  appRunning: boolean;
  previewUrl: string | null;
  persistence: Promise<void>;
  abort?: AbortController;
  pending: Map<
    string,
    {
      resolve: (data: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >;
};
type PreviewRequest = {
  project: string;
  response: ServerResponse;
  timer: NodeJS.Timeout;
};
const rooms = new Map<string, Room>();
const previewRequests = new Map<string, PreviewRequest>();
const previewDomain = process.env.RUNLY_PREVIEW_DOMAIN?.toLowerCase() || "";
const sandboxDomains = [
  new URL(gateway!.url).hostname.toLowerCase(),
  "registry.npmjs.org",
  "api.openai.com",
  "codex-cloud-environments.chatgpt.com",
  ...(process.env.RUNLY_SANDBOX_ALLOWED_DOMAINS || "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean),
];
const allowedSandboxDomains = [...new Set(sandboxDomains)];
if (
  allowedSandboxDomains.length > 100 ||
  (allowedSandboxDomains.some(
    (name) =>
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name),
  ) &&
    process.env.RUNLY_RUNTIME_MODE !== "mock")
)
  throw new Error("Configure valid sandbox network allowlist domains");
if (
  !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
    previewDomain,
  )
)
  throw new Error(
    "Configure RUNLY_PREVIEW_DOMAIN to a valid isolated preview domain",
  );
let closing = false;
let hasLease = false;
function room(project: string): Room {
  let value = rooms.get(project);
  if (!value) {
    value = {
      browsers: new Set(),
      history: [],
      historySize: 0,
      lastActive: Date.now(),
      busy: false,
      appRunning: false,
      previewUrl: null,
      persistence: Promise.resolve(),
      pending: new Map(),
    };
    rooms.set(project, value);
  }
  return value;
}
function send(socket: WebSocket, data: unknown) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > 2 * 1024 * 1024) {
    socket.close(1013, "Slow connection; reconnect");
    return;
  }
  socket.send(JSON.stringify(data));
}
function publish(project: string, frame: Frame) {
  const value = room(project);
  if (["terminal.output", "console.output"].includes(frame.type)) {
    const encoded = JSON.stringify(frame);
    value.history.push(encoded);
    value.historySize += encoded.length;
    while (value.historySize > 256_000)
      value.historySize -= value.history.shift()!.length;
  }
  for (const socket of value.browsers) send(socket, frame);
}
async function check<T>(
  operation: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const result = await operation;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function access(project: string, user: string) {
  const identity = await db.auth.admin.getUserById(user);
  if (
    identity.error ||
    !identity.data.user?.email_confirmed_at ||
    (identity.data.user.banned_until &&
      Date.parse(identity.data.user.banned_until) > Date.now())
  )
    return false;
  const value = await check(
    db
      .from("projects")
      .select("owner_id,workspace_id")
      .eq("id", project)
      .maybeSingle(),
  );
  if (!value) return false;
  if (value.owner_id === user) return true;
  if (!value.workspace_id) return false;
  return !!(await check(
    db
      .from("memberships")
      .select("user_id")
      .eq("workspace_id", value.workspace_id)
      .eq("user_id", user)
      .maybeSingle(),
  ));
}
async function computeAllowed(project: string) {
  const policy = await check(
    db.from("runtime_policy").select("enabled").eq("id", true).single(),
  );
  const emergency = await check(
    db
      .from("provider_config")
      .select("emergency_stop")
      .eq("id", true)
      .maybeSingle(),
  );
  if (!policy?.enabled || emergency?.emergency_stop) return false;
  const owner = await check(
    db
      .from("projects")
      .select("owner_id,workspace_id")
      .eq("id", project)
      .single(),
  );
  if (!owner) return false;
  let query = db
    .from("plan_entitlements")
    .select("id")
    .eq("active", true)
    .lte("starts_at", new Date().toISOString())
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);
  query = owner.workspace_id
    ? query.eq("workspace_id", owner.workspace_id)
    : query.eq("user_id", owner.owner_id);
  return !!(await check(query.limit(1)))?.length;
}
async function updateRuntime(project: string, values: Record<string, unknown>) {
  await check(
    db
      .from("project_runtimes")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("project_id", project),
  );
  if (values.state)
    publish(project, {
      type: "runtime.status",
      state: values.state,
      error: values.error || null,
    });
}
function callBridge(
  project: string,
  command: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<unknown> {
  const value = room(project);
  if (!value.bridge || value.bridge.readyState !== WebSocket.OPEN)
    return Promise.reject(
      new Error("Start the workspace and wait for it to connect."),
    );
  if (value.pending.size >= 64)
    return Promise.reject(new Error("Too many pending workspace operations"));
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      value.pending.delete(id);
      reject(
        new Error("Workspace operation timed out; reload before retrying."),
      );
    }, timeoutMs);
    value.pending.set(id, { resolve, reject, timer });
    send(value.bridge!, { ...command, type: "command", id });
  });
}
const pathSchema = z
  .string()
  .refine(validWorkspacePath, "Invalid workspace path");
const fileSchema = z.object({
  path: pathSchema,
  kind: z.enum(["file", "folder"]),
  content: z.string().max(1_048_576),
  hash: z.string().max(64),
});
async function persistFiles(project: string, frame: Frame) {
  const files = z.array(fileSchema).max(1000).parse(frame.files);
  const removed = z.array(pathSchema).max(1000).parse(frame.deleted);
  if (frame.full) {
    const previous = await check(
      db
        .from("runtime_files")
        .select("path")
        .eq("project_id", project)
        .limit(1000),
    );
    const current = new Set(files.map((file) => file.path));
    for (const file of previous || [])
      if (!current.has(file.path)) removed.push(file.path);
  }
  for (let i = 0; i < files.length; i += 50)
    await check(
      db.from("runtime_files").upsert(
        files
          .slice(i, i + 50)
          .map((file) => ({ ...file, project_id: project })),
        { onConflict: "project_id,path" },
      ),
    );
  for (let i = 0; i < removed.length; i += 50)
    await check(
      db
        .from("runtime_files")
        .delete()
        .eq("project_id", project)
        .in("path", removed.slice(i, i + 50)),
    );
  publish(project, {
    type: "files.changed",
    files,
    deleted: removed,
    full: !!frame.full,
  });
}
async function startWorkspace(project: string) {
  const value = room(project);
  if (value.bridge?.readyState === WebSocket.OPEN) return;
  const current = await check(
    db.from("project_runtimes").select("*").eq("project_id", project).single(),
  );
  if (!current) throw new Error("Workspace record missing");
  if (current.session_id) {
    // A gateway restart may simply have interrupted the connector. Give it time
    // to reconnect before replacing compute. Never overwrite a live workspace.
    for (let i = 0; i < 10 && !value.bridge; i++) await delay(1000);
    if (value.bridge) return;
    throw new Error(
      "The existing sandbox is disconnected. Restore gateway connectivity before restarting; it may contain unsaved files.",
    );
  }
  const active = await check(
    db
      .from("project_runtimes")
      .select("project_id")
      .eq("gateway_id", gatewayId)
      .in("state", ["starting", "ready"]),
  );
  if (
    (active || []).filter((row) => row.project_id !== project).length >=
    MAX_ACTIVE
  )
    throw new Error(
      "Runtime capacity reached. Stop another workspace or retry later.",
    );
  const savedFiles = await check(
    db
      .from("runtime_files")
      .select("path,kind,content,hash")
      .eq("project_id", project)
      .limit(1000),
  );
  // Historical snapshots may contain names that are now excluded. Keep those
  // records in storage for operator review, but never restore them into code.
  const files = z
    .array(fileSchema)
    .parse(
      (savedFiles || []).filter((file) => validWorkspacePath(file.path)),
    ) as File[];
  if (
    files.reduce((size, file) => size + Buffer.byteLength(file.content), 0) >
    8 * 1024 * 1024
  )
    throw new Error("Workspace snapshot exceeds 8 MiB");
  const generation = randomUUID(),
    token = randomBytes(32).toString("hex"),
    previewToken = randomBytes(24).toString("hex"),
    previewUrl = `https://${previewToken}.${previewDomain}/`;
  value.generation = generation;
  await updateRuntime(project, {
    state: "starting",
    error: null,
    generation,
    session_id: null,
    bridge_token_hash: digest(token),
    preview_token_hash: digest(previewToken),
  });
  const source = await readFile(
    new URL("./bridge.py", import.meta.url),
    "utf8",
  );
  const folders = Buffer.from(
    JSON.stringify(
      files.filter((file) => file.kind === "folder").map((file) => file.path),
    ),
  ).toString("base64");
  const session = await openai.beta.agents.sessions.create({
    agent: {
      model: process.env.OPENAI_MODEL!,
      instructions:
        "You are Runly's coding agent. All project code is in /workspace/project; use that as your working directory. Implement the user's requests and verify changes. The Explorer, interactive terminal, and running application share this directory. Do not change /workspace/.runly or the connector process. Do not start duplicate application servers. Explain changes and test results. Keep generated dependency/build directories out of source files. Other project chats share the same workspace; respect the current chat's supplied context.",
    },
    metadata: { runly_project: project, runly_generation: generation },
    environment: {
      type: "openai_hosted",
      network:
        process.env.RUNLY_RUNTIME_MODE === "mock"
          ? { access: "enabled" }
          : { access: "restricted", allowed_domains: allowedSandboxDomains },
      packages: { python: ["websocket-client==1.8.0"] },
      env: {
        RUNLY_GATEWAY_URL: gateway!.url,
        RUNLY_PROJECT_ID: project,
        RUNLY_GENERATION: generation,
        RUNLY_BRIDGE_TOKEN: token,
        RUNLY_PREVIEW_URL: previewUrl,
      },
      files: [
        {
          type: "inline",
          path: "/workspace/.runly/bridge.py",
          data: Buffer.from(source).toString("base64"),
        },
        ...files
          .filter((file) => file.kind === "file")
          .map((file) => ({
            type: "inline" as const,
            path: `/workspace/project/${file.path}`,
            data: Buffer.from(file.content).toString("base64"),
          })),
      ],
      setup_commands: [
        {
          command: `python -c "import pathlib,json,base64; r=pathlib.Path('/workspace/project'); r.mkdir(exist_ok=True); [(r/p).mkdir(parents=True,exist_ok=True) for p in json.loads(base64.b64decode('${folders}'))]"`,
        },
        {
          command:
            "nohup python /workspace/.runly/bridge.py >/tmp/runly-bridge.log 2>&1 </dev/null &",
        },
      ],
    },
  });
  await updateRuntime(project, { session_id: session.id });
  // Fail visibly if this hosted environment does not preserve the connector.
  for (let i = 0; i < 120 && !value.bridge; i++) {
    await delay(1000);
    if (i % 10 === 0 && session.environment && "id" in session.environment) {
      const environment = await openai.beta.agents.environments.retrieve(
        session.environment.id,
      );
      if (environment.status === "failed")
        throw new Error(
          "Sandbox setup failed. Inspect the provider environment and gateway connectivity.",
        );
    }
  }
  if (!value.bridge)
    throw new Error(
      "Sandbox connector did not connect. Check the public WSS gateway URL and hosted background-process support.",
    );
  await updateRuntime(project, { state: "ready", error: null });
}
async function stopWorkspace(project: string) {
  const value = room(project);
  const unresolved = await check(
    db
      .from("runtime_jobs")
      .select("id")
      .eq("project_id", project)
      .eq("provider_submitted", true)
      .is("usage", null)
      .limit(1),
  );
  if (unresolved?.length)
    throw new Error(
      "Reconcile the unfinished provider task before stopping this sandbox; its session is needed to recover usage and output.",
    );
  if (value.bridge) {
    await callBridge(project, { op: "snapshot" });
    await value.persistence; // Do not destroy the only copy of pending file edits.
  }
  const current = await check(
    db
      .from("project_runtimes")
      .select("session_id")
      .eq("project_id", project)
      .single(),
  );
  if (current?.session_id) {
    if (!value.bridge)
      throw new Error(
        "Reconnect the sandbox before stopping it so its files can be backed up.",
      );
    try {
      await openai.beta.agents.sessions.delete(current.session_id);
    } catch (error) {
      if (!(error instanceof OpenAI.APIError && error.status === 404))
        throw error;
    }
  }
  value.bridge?.close();
  value.bridge = undefined;
  value.appRunning = false;
  value.previewUrl = null;
  publish(project, { type: "app.status", running: false, previewUrl: null });
  await updateRuntime(project, {
    state: "stopped",
    session_id: null,
    bridge_token_hash: null,
    preview_token_hash: null,
    error: null,
  });
}
async function runAgent(job: Job) {
  const value = room(job.project_id);
  await startWorkspace(job.project_id);
  const runtime = await check(
    db
      .from("project_runtimes")
      .select("session_id")
      .eq("project_id", job.project_id)
      .single(),
  );
  if (!runtime?.session_id) throw new Error("Sandbox session missing");
  const sessionId = runtime.session_id as string;
  // Never steer an orphaned turn after a worker restart. Operator reconciliation
  // is required for uncertain work, instead of submitting a second instruction.
  const previous = await check(
    db
      .from("runtime_jobs")
      .select("id")
      .eq("project_id", job.project_id)
      .eq("state", "failed")
      .eq("provider_submitted", true)
      .is("usage", null)
      .limit(1),
  );
  if (previous?.length)
    throw new Error(
      "An interrupted task needs operator reconciliation before this project can run another agent task.",
    );
  const history = await check(
    db
      .from("messages")
      .select("role,body")
      .eq("conversation_id", job.conversation_id!)
      .order("created_at", { ascending: false })
      .limit(20),
  );
  const controller = new AbortController();
  value.abort = controller;
  const deadline = setTimeout(() => controller.abort(), TURN_MS);
  let turnId = "",
    completed = false;
  const parts = new Map<string, string>();
  let publishedAt = 0;
  try {
    // Connect before submitting input; the provider stream does not replay events.
    const events = await openai.beta.agents.sessions.events.stream(sessionId, {
      signal: controller.signal,
    });
    try {
      await check(
        db
          .from("runtime_jobs")
          .update({ provider_submitted: true })
          .eq("id", job.id),
      );
      await openai.beta.agents.sessions.events.create(sessionId, {
        "Idempotency-Key": job.id,
        events: [
          {
            type: "agent.session.input.message",
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: `Runly chat ${job.conversation_id}. Recent conversation (oldest first):\n${(
                      history || []
                    )
                      .reverse()
                      .map((m) => `${m.role}: ${m.body}`)
                      .join("\n")
                      .slice(-40_000)}\n\nCurrent request:\n${job.input}`,
                  },
                ],
              },
            ],
          },
        ],
      });
      for await (const event of events) {
        if (
          event.type === "agent.session.turn.created" &&
          event.turn.subagent_id === null
        ) {
          turnId = event.turn.id;
          await check(
            db
              .from("runtime_jobs")
              .update({ provider_turn_id: turnId })
              .eq("id", job.id),
          );
        }
        if (
          event.type === "agent.session.turn.output_text.delta" ||
          event.type === "agent.session.turn.output_text.done"
        ) {
          const key = `${event.item_id}:${event.content_index}`;
          parts.set(
            key,
            event.type === "agent.session.turn.output_text.done"
              ? event.text
              : (parts.get(key) || "") + event.delta,
          );
          if (
            Date.now() - publishedAt >= 50 ||
            event.type === "agent.session.turn.output_text.done"
          ) {
            publishedAt = Date.now();
            publish(job.project_id, {
              type: "agent.text",
              chatId: job.conversation_id,
              jobId: job.id,
              text: [...parts.values()].join("\n\n").slice(-50_000),
            });
          }
        }
        if (
          event.type === "agent.session.turn.completed" &&
          event.turn.subagent_id === null
        ) {
          turnId = event.turn.id;
          completed = true;
          break;
        }
        if (
          (event.type === "agent.session.turn.failed" ||
            event.type === "agent.session.turn.cancelled") &&
          event.turn.subagent_id === null
        )
          throw new Error(
            "The agent task did not complete. Inspect its changes before retrying.",
          );
        if (
          [
            "error",
            "agent.session.failed",
            "agent.session.environment.failed",
            "agent.session.requires_action",
          ].includes(event.type)
        )
          throw new Error(
            "The agent requires attention. Inspect the provider session before retrying.",
          );
      }
    } finally {
      events.controller.abort();
    }
    if (!completed)
      throw new Error(
        "Agent stream disconnected. Inspect the saved task before retrying.",
      );
    const items = openai.beta.agents.sessions.items.list(sessionId, {
      order: "desc",
      limit: 100,
    });
    const answers: string[] = [];
    for await (const item of items) {
      if (item.turn_id !== turnId) break;
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
    const answer = (
      answers.join("\n\n") ||
      [...parts.values()].join("\n\n") ||
      "Task completed. Review the workspace changes."
    ).slice(0, 50_000);
    // Deterministic ID makes worker reconciliation safe from duplicate messages.
    const assistantId = digest(`assistant:${job.id}`)
      .slice(0, 32)
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
    await check(
      db.from("messages").upsert(
        {
          id: assistantId,
          conversation_id: job.conversation_id,
          role: "assistant",
          body: answer,
        },
        { onConflict: "id", ignoreDuplicates: true },
      ),
    );
    const turn = await openai.beta.agents.sessions.turns.retrieve(turnId, {
      session_id: sessionId,
    });
    await check(
      db.from("runtime_jobs").update({ usage: turn.usage }).eq("id", job.id),
    );
    if (!turn.usage)
      throw new Error(
        "Provider usage is not available yet; the usage reservation remains held for reconciliation.",
      );
    await check(
      db.rpc("settle_runtime_usage", {
        p_job: job.id,
        p_input: turn.usage.input_tokens,
        p_output: turn.usage.output_tokens,
        p_turn: turnId,
      }),
    );
    await callBridge(job.project_id, { op: "snapshot" });
    await value.persistence;
  } catch (error) {
    // A disconnected client/stream is not cancellation. Explicitly stop the turn.
    await openai.beta.agents.sessions.events
      .create(sessionId, { events: [{ type: "agent.session.input.cancel" }] })
      .catch(() => undefined);
    // Cancellation may still consume tokens. Settle reported usage when known;
    // leave the reservation held if the outcome is uncertain.
    if (turnId) {
      try {
        for (let attempt = 0; attempt < 10; attempt++) {
          const turn = await openai.beta.agents.sessions.turns.retrieve(
            turnId,
            { session_id: sessionId },
          );
          if (
            ["completed", "failed", "cancelled"].includes(turn.status) &&
            turn.usage
          ) {
            await check(
              db.rpc("settle_runtime_usage", {
                p_job: job.id,
                p_input: turn.usage.input_tokens,
                p_output: turn.usage.output_tokens,
                p_turn: turnId,
              }),
            );
            await check(
              db
                .from("runtime_jobs")
                .update({ usage: turn.usage })
                .eq("id", job.id),
            );
            break;
          }
          await delay(300);
        }
      } catch {
        /* Operator reconciliation is required if provider/control plane is down. */
      }
    }
    throw error;
  } finally {
    clearTimeout(deadline);
    value.abort = undefined;
  }
}

const commandSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("command"),
  op: z.enum([
    "read",
    "write",
    "mkdir",
    "rename",
    "delete",
    "snapshot",
    "terminal.open",
    "terminal.input",
    "terminal.resize",
    "app.start",
    "app.stop",
    "agent.cancel",
  ]),
  path: pathSchema.optional(),
  to: pathSchema.optional(),
  content: z.string().max(1_048_576).optional(),
  hash: z.string().max(64).optional(),
  create: z.boolean().optional(),
  data: z.string().max(16384).optional(),
  command: z.string().max(2000).optional(),
  cols: z.number().int().min(1).max(400).optional(),
  rows: z.number().int().min(1).max(200).optional(),
});
const previewRequestMethods = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);
const requestHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "forwarded",
  "x-real-ip",
]);
const responseHopHeaders = new Set([
  ...requestHopHeaders,
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
]);
function plainResponse(
  response: ServerResponse,
  status: number,
  message: string,
) {
  const body = Buffer.from(message);
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(body);
}
function finishPreview(id: string, frame: Frame) {
  const pending = previewRequests.get(id);
  if (!pending || pending.response.destroyed) return;
  clearTimeout(pending.timer);
  previewRequests.delete(id);
  const status = Number(frame.status);
  const body = Buffer.from(String(frame.body || ""), "base64");
  if (
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599 ||
    body.length > 8 * 1024 * 1024
  ) {
    plainResponse(
      pending.response,
      502,
      "Preview returned an invalid response.",
    );
    return;
  }
  const headers: Record<string, string | string[]> = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (Array.isArray(frame.headers)) {
    for (const pair of frame.headers) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const name = String(pair[0]).toLowerCase();
      let value = String(pair[1]);
      if (name === "set-cookie")
        value = value.replace(/;\s*domain=[^;]*/gi, "");
      if (
        !/^[a-z0-9-]+$/.test(name) ||
        /[\r\n\0]/.test(value) ||
        responseHopHeaders.has(name)
      )
        continue;
      const previous = headers[name];
      headers[name] = previous
        ? [...(Array.isArray(previous) ? previous : [previous]), value]
        : value;
    }
  }
  if (pending.response.req.method === "HEAD")
    pending.response.writeHead(status, headers).end();
  else pending.response.writeHead(status, headers).end(body);
}
function failPreviewRequests(project: string, message: string) {
  for (const [id, pending] of previewRequests) {
    if (pending.project !== project) continue;
    clearTimeout(pending.timer);
    previewRequests.delete(id);
    if (!pending.response.destroyed)
      plainResponse(pending.response, 503, message);
  }
}
async function proxyPreview(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
) {
  if (closing || !hasLease)
    return plainResponse(response, 503, "Preview gateway is starting.");
  if (!previewRequestMethods.has(request.method || ""))
    return plainResponse(response, 405, "Method not allowed.");
  if (
    !request.url?.startsWith("/") ||
    request.url.startsWith("//") ||
    request.url.length > 4096
  )
    return plainResponse(response, 400, "Invalid preview URL.");
  if (previewRequests.size >= 256)
    return plainResponse(
      response,
      503,
      "Preview capacity is busy; retry shortly.",
    );

  let runtime: { project_id: string; generation: string; state: string } | null;
  try {
    runtime = await check(
      db
        .from("project_runtimes")
        .select("project_id,generation,state")
        .eq("preview_token_hash", digest(token))
        .eq("gateway_id", gatewayId)
        .maybeSingle(),
    );
  } catch {
    return plainResponse(
      response,
      503,
      "Preview authorization is temporarily unavailable.",
    );
  }
  if (!runtime || runtime.state !== "ready")
    return plainResponse(response, 404, "Preview session not found.");
  const value = rooms.get(runtime.project_id);
  if (
    !value?.bridge ||
    value.bridge.readyState !== WebSocket.OPEN ||
    value.generation !== runtime.generation
  )
    return plainResponse(response, 503, "Preview workspace is disconnected.");
  if (!value.appRunning)
    return plainResponse(
      response,
      503,
      "Start the application from Preview first.",
    );

  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      length += buffer.length;
      if (length > 1 * 1024 * 1024)
        return plainResponse(
          response,
          413,
          "Preview request body exceeds 1 MiB.",
        );
      chunks.push(buffer);
    }
  } catch {
    return plainResponse(response, 400, "Could not read preview request.");
  }
  const headers: [string, string][] = [];
  for (const [name, value] of Object.entries(request.headers)) {
    if (
      !value ||
      requestHopHeaders.has(name.toLowerCase()) ||
      name.toLowerCase().startsWith("x-forwarded-")
    )
      continue;
    for (const item of Array.isArray(value) ? value : [value])
      headers.push([name, item]);
  }
  headers.push(["x-forwarded-host", request.headers.host || ""]);
  headers.push(["x-forwarded-proto", "https"]);
  if (request.socket.remoteAddress)
    headers.push(["x-forwarded-for", request.socket.remoteAddress]);
  const id = randomUUID();
  const timer = setTimeout(() => {
    previewRequests.delete(id);
    plainResponse(response, 504, "Preview app request timed out.");
  }, 35_000);
  previewRequests.set(id, { project: runtime.project_id, response, timer });
  response.on("close", () => {
    const pending = previewRequests.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      previewRequests.delete(id);
    }
  });
  try {
    send(value.bridge, {
      type: "preview.request",
      id,
      method: request.method,
      path: request.url,
      headers,
      body: Buffer.concat(chunks).toString("base64"),
    });
  } catch {
    clearTimeout(timer);
    previewRequests.delete(id);
    plainResponse(response, 503, "Could not reach the preview workspace.");
  }
}
const internalNonces = new Map<string, number>();
const internalGitSchema = z.object({
  project: z.string().uuid(),
  user: z.string().uuid(),
  action: z.enum([
    "status",
    "link",
    "restore",
    "checkout",
    "branch",
    "pull",
    "push",
  ]),
  branch: z.string().max(100).optional(),
  url: z.string().url().max(300).optional(),
  token: z.string().max(4096).optional(),
  author: z.string().max(120).optional(),
  email: z.email().max(254).optional(),
  message: z.string().max(120).optional(),
});
async function handleInternalGit(
  request: IncomingMessage,
  response: ServerResponse,
) {
  try {
    if (!hasLease || closing) throw new Error("Gateway is unavailable");
    if (
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        request.socket.remoteAddress || "",
      )
    )
      throw new Error("Internal endpoint requires loopback access");
    const stamp = Number(request.headers["x-runly-timestamp"]);
    const nonce = String(request.headers["x-runly-nonce"] || "");
    const signature = Buffer.from(
      String(request.headers["x-runly-signature"] || ""),
      "hex",
    );
    if (
      !Number.isFinite(stamp) ||
      Math.abs(Date.now() - stamp) > 30_000 ||
      !/^[a-f0-9-]{36}$/.test(nonce) ||
      internalNonces.has(nonce)
    )
      throw new Error("Invalid internal request");
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const part of request) {
      const chunk = Buffer.from(part);
      length += chunk.length;
      if (length > 12_000) throw new Error("Request too large");
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    const expected = createHmac("sha256", secret)
      .update(`${stamp}.${nonce}.`)
      .update(raw)
      .digest();
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(signature, expected)
    )
      throw new Error("Invalid internal signature");
    for (const [key, until] of internalNonces)
      if (until < Date.now()) internalNonces.delete(key);
    internalNonces.set(nonce, Date.now() + 60_000);
    const input = internalGitSchema.parse(JSON.parse(raw.toString("utf8")));
    // The hosted sandbox runs arbitrary project code under the same OS user as
    // the connector. Until Git runs in an isolated trusted worker, forwarding
    // an installation token would expose it to that code.
    if (
      (process.env.NODE_ENV === "production" ||
        !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(
          process.env.RUNLY_SITE_URL || "",
        )) &&
      (input.action !== "status" || input.token)
    )
      throw new Error(
        "Hosted Git writes require an isolated credential broker",
      );
    if (!(await access(input.project, input.user)))
      throw new Error("Project access denied");
    const value = room(input.project);
    if (value.busy)
      throw new Error(
        "Wait for the agent to finish before managing Git branches",
      );
    value.lastActive = Date.now();
    const result = await callBridge(
      input.project,
      { op: "git", ...input },
      240_000,
    );
    await value.persistence;
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(409, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(
      JSON.stringify({
        message:
          error instanceof Error ? error.message : "Git operation failed",
      }),
    );
  }
}
const http = createServer((request, response) => {
  if (request.url === "/internal/git") {
    if (request.method !== "POST")
      return plainResponse(response, 405, "Method not allowed");
    void handleInternalGit(request, response);
    return;
  }
  const host = (request.headers.host || "").split(":")[0].toLowerCase();
  const suffix = `.${previewDomain}`;
  if (host.endsWith(suffix)) {
    const token = host.slice(0, -suffix.length);
    if (!/^[a-f0-9]{48}$/.test(token))
      return plainResponse(response, 404, "Preview session not found.");
    void proxyPreview(request, response, token);
    return;
  }
  response.writeHead(closing || !hasLease ? 503 : 200, {
    "Content-Type": "application/json",
  });
  response.end(
    JSON.stringify({
      status: closing ? "draining" : hasLease ? "ok" : "starting",
    }),
  );
});
const sockets = new WebSocketServer({
  server: http,
  maxPayload: 12 * 1024 * 1024,
  perMessageDeflate: false,
});
sockets.on("connection", (socket, request) => {
  if (closing || !hasLease) {
    socket.close(1013, "Gateway is not ready");
    return;
  }
  let project = "",
    user = "",
    role = "",
    authenticated = false,
    authenticating = false;
  let received = 0,
    windowStart = Date.now(),
    verifiedAt = 0;
  let alive = true;
  socket.on("pong", () => {
    alive = true;
  });
  const authDeadline = setTimeout(
    () => socket.close(1008, "Authentication required"),
    5000,
  );
  const heartbeat = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
    if (
      role === "browser" &&
      authenticated &&
      Date.now() - verifiedAt > 60_000
    ) {
      verifiedAt = Date.now();
      void access(project, user)
        .then((allowed) => {
          if (!allowed) socket.close(1008, "Project access revoked");
        })
        .catch(() => socket.close(1013, "Authorization unavailable"));
    }
  }, 20_000);
  socket.on("message", async (raw) => {
    try {
      if (Date.now() - windowStart > 1000) {
        received = 0;
        windowStart = Date.now();
      }
      if (++received > (role === "bridge" ? 1000 : 100))
        throw new Error("Connection rate limit exceeded");
      const frame = JSON.parse(raw.toString()) as Frame;
      if (!authenticated) {
        if (authenticating) throw new Error("Authentication in progress");
        authenticating = true;
        if (frame.type !== "auth") throw new Error("Authentication required");
        if (frame.role === "browser") {
          if (
            request.headers.origin !==
            new URL(process.env.RUNLY_SITE_URL!).origin
          )
            throw new Error("Invalid origin");
          const ticket = verifyTicket(String(frame.ticket), secret);
          if (
            ticket.gateway !== gatewayId ||
            !(await access(ticket.project, ticket.user))
          )
            throw new Error("Access denied");
          project = ticket.project;
          user = ticket.user;
          role = "browser";
          verifiedAt = Date.now();
          const value = room(project);
          value.browsers.add(socket);
          value.lastActive = Date.now();
          for (const event of value.history) socket.send(event);
          const status = await check(
            db
              .from("project_runtimes")
              .select("state")
              .eq("project_id", project)
              .maybeSingle(),
          );
          send(socket, {
            type: "runtime.status",
            state: value.bridge
              ? "ready"
              : status?.state === "ready"
                ? "disconnected"
                : status?.state || "stopped",
          });
          send(socket, {
            type: "app.status",
            running: value.appRunning,
            previewUrl: value.previewUrl,
          });
        } else if (frame.role === "bridge") {
          const id = z.string().uuid().parse(frame.project);
          const runtime = await check(
            db
              .from("project_runtimes")
              .select("gateway_id,generation,bridge_token_hash")
              .eq("project_id", id)
              .single(),
          );
          if (
            !runtime ||
            runtime.gateway_id !== gatewayId ||
            runtime.generation !== frame.generation ||
            runtime.bridge_token_hash !== digest(String(frame.token))
          )
            throw new Error("Invalid sandbox connection");
          project = id;
          role = "bridge";
          const value = room(project);
          value.bridge?.close(1000, "Reconnected");
          value.bridge = socket;
          value.generation = runtime.generation;
          await updateRuntime(project, { state: "ready", error: null });
        } else throw new Error("Invalid connection role");
        authenticated = true;
        clearTimeout(authDeadline);
        send(socket, { type: "authenticated" });
        if (role === "browser" && room(project).bridge) {
          // Close the race between the initial HTTP snapshot and subscribing.
          void callBridge(project, { op: "snapshot" }).catch(() =>
            send(socket, {
              type: "workspace.warning",
              message:
                "Couldn't refresh the live file snapshot. Reconnect before editing.",
            }),
          );
        }
        return;
      }
      const value = room(project);
      if (role === "bridge") {
        if (value.bridge !== socket) return;
        if (frame.type === "reply") {
          const pending = value.pending.get(String(frame.id));
          if (pending) {
            clearTimeout(pending.timer);
            value.pending.delete(String(frame.id));
            if (frame.error) pending.reject(new Error(String(frame.error)));
            else pending.resolve(frame.result);
          }
        } else if (frame.type === "files.changed") {
          // A full snapshot repairs a failed delta backup; never silently skip a
          // failed delta and then report a later partial update as safely saved.
          value.persistence = (
            frame.full
              ? value.persistence.catch(() => undefined)
              : value.persistence
          ).then(() => persistFiles(project, frame));
          value.persistence.catch(() =>
            publish(project, {
              type: "workspace.warning",
              message:
                "File backup failed; keep this workspace open and retry.",
            }),
          );
        } else if (frame.type === "preview.response") {
          finishPreview(String(frame.id || ""), frame);
        } else if (
          [
            "terminal.output",
            "terminal.exit",
            "console.output",
            "app.status",
            "workspace.warning",
          ].includes(frame.type)
        ) {
          if (frame.type === "app.status") {
            value.appRunning = !!frame.running;
            value.previewUrl =
              typeof frame.previewUrl === "string" ? frame.previewUrl : null;
          }
          publish(project, frame);
        }
        return;
      }
      if (Date.now() - verifiedAt > 60_000) {
        if (!(await access(project, user)))
          throw new Error("Project access revoked");
        verifiedAt = Date.now();
      }
      // Keep sandbox lifetime tied to meaningful browser activity, not socket
      // pings. This is server-authoritative and does not keep idle tabs alive.
      if (role === "browser" && frame.type === "activity") {
        value.lastActive = Date.now();
        return;
      }
      const command = commandSchema.parse(frame);
      value.lastActive = Date.now();
      try {
        if (command.op === "agent.cancel") {
          value.abort?.abort();
          send(socket, { type: "reply", id: command.id, result: {} });
          return;
        }
        if (
          value.busy &&
          [
            "write",
            "mkdir",
            "rename",
            "delete",
            "terminal.input",
            "app.start",
          ].includes(command.op)
        )
          throw new Error(
            "Wait for the agent to finish before changing the workspace, or stop its task.",
          );
        const result = await callBridge(project, command);
        if (["write", "mkdir", "rename", "delete"].includes(command.op))
          await value.persistence;
        send(socket, { type: "reply", id: command.id, result });
      } catch (error) {
        send(socket, {
          type: "reply",
          id: command.id,
          error:
            error instanceof Error
              ? error.message
              : "Workspace operation failed",
        });
      }
    } catch {
      socket.close(1008, "Invalid or unauthorized workspace request");
    }
  });
  socket.on("error", () => socket.close());
  socket.on("close", () => {
    clearTimeout(authDeadline);
    clearInterval(heartbeat);
    if (!project) return;
    const value = room(project);
    value.browsers.delete(socket);
    if (value.bridge === socket) {
      value.bridge = undefined;
      failPreviewRequests(project, "Preview workspace disconnected.");
      for (const pending of value.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(
          new Error("Sandbox disconnected; reload before retrying."),
        );
      }
      value.pending.clear();
      publish(project, { type: "runtime.status", state: "disconnected" });
    }
  });
});

async function execute(job: Job) {
  const value = room(job.project_id);
  value.busy = true;
  value.lastActive = Date.now();
  publish(job.project_id, {
    type: "job.status",
    id: job.id,
    state: "running",
    chatId: job.conversation_id,
  });
  const lease = setInterval(() => {
    void check(
      db
        .from("runtime_jobs")
        .update({ lease_until: new Date(Date.now() + 120_000).toISOString() })
        .eq("id", job.id)
        .eq("worker_id", workerId)
        .eq("state", "running")
        .select("id"),
    )
      .then((rows) => {
        if (!rows?.length) value.abort?.abort();
      })
      .catch(() => value.abort?.abort());
  }, 30_000);
  try {
    if (!(await access(job.project_id, job.actor_id)))
      throw new Error("Project access revoked");
    if (job.kind !== "stop" && !(await computeAllowed(job.project_id)))
      throw new Error("Runtime disabled or project subscription inactive");
    if (job.kind === "start") await startWorkspace(job.project_id);
    else if (job.kind === "stop") await stopWorkspace(job.project_id);
    else await runAgent(job);
    await check(
      db
        .from("runtime_jobs")
        .update({ state: "completed", finished_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("worker_id", workerId),
    );
    publish(job.project_id, {
      type: "job.status",
      id: job.id,
      state: "completed",
      chatId: job.conversation_id,
    });
  } catch (error) {
    const message = (
      error instanceof OpenAI.APIError
        ? `OpenAI request failed (${error.status || "connection"}). Check provider access and runtime logs.`
        : error instanceof Error
          ? error.message
          : "Runtime task failed"
    ).slice(0, 500);
    const record = await check(
      db
        .from("runtime_jobs")
        .select("provider_submitted,reservation_id")
        .eq("id", job.id)
        .single(),
    );
    if (record?.reservation_id && !record.provider_submitted)
      await check(
        db
          .from("usage_reservations")
          .update({ status: "released" })
          .eq("id", record.reservation_id)
          .eq("status", "reserved"),
      );
    await check(
      db
        .from("runtime_jobs")
        .update({
          state: "failed",
          error: message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("worker_id", workerId),
    );
    if (!value.bridge)
      await updateRuntime(job.project_id, { state: "error", error: message });
    publish(job.project_id, {
      type: "job.status",
      id: job.id,
      state: "failed",
      chatId: job.conversation_id,
      error: message,
    });
  } finally {
    value.busy = false;
    value.lastActive = Date.now();
    clearInterval(lease);
  }
}
async function work() {
  hasLease = !!(await check(
    db.rpc("lease_runtime_gateway", {
      p_gateway: gatewayId,
      p_worker: workerId,
    }),
  ));
  if (!hasLease) throw new Error("Another process owns this gateway ID");
  const gatewayLease = setInterval(() => {
    void check(
      db.rpc("lease_runtime_gateway", {
        p_gateway: gatewayId,
        p_worker: workerId,
      }),
    )
      .then((owned) => {
        if (!owned) throw new Error("Gateway lease lost");
      })
      .catch(() => {
        hasLease = false;
        closing = true;
        for (const value of rooms.values()) value.abort?.abort();
        for (const socket of sockets.clients)
          socket.close(1013, "Gateway lease unavailable");
        setTimeout(() => process.exit(1), 5000).unref();
      });
  }, 15_000);
  const existing = await check(
    db
      .from("project_runtimes")
      .select("project_id")
      .eq("gateway_id", gatewayId)
      .not("session_id", "is", null),
  );
  for (const row of existing || []) room(row.project_id);
  let checkedPolicy = 0;
  while (!closing) {
    try {
      if (
        [...rooms.values()].filter((value) => value.busy).length < MAX_ACTIVE
      ) {
        const jobs = (await check(
          db.rpc("claim_runtime_job", {
            p_gateway: gatewayId,
            p_worker: workerId,
          }),
        )) as Job[];
        for (const job of jobs || [])
          void execute(job).catch(() =>
            console.error("Runtime job persistence failed"),
          );
      }
      for (const [project, value] of rooms) {
        if (
          Date.now() - checkedPolicy > 60_000 &&
          value.bridge &&
          !(await computeAllowed(project))
        ) {
          value.abort?.abort();
          if (!value.busy) await stopWorkspace(project);
        }
        if (!value.busy && Date.now() - value.lastActive > IDLE_MS) {
          value.busy = true;
          try {
            if (value.bridge) await stopWorkspace(project);
            if (!value.browsers.size) rooms.delete(project);
          } finally {
            value.busy = false;
            value.lastActive = Date.now();
          }
        }
      }
      if (Date.now() - checkedPolicy > 60_000) checkedPolicy = Date.now();
    } catch {
      console.error(
        "Runtime worker could not reach its control plane; retrying",
      );
    }
    await delay(1000);
  }
  clearInterval(gatewayLease);
}
for (const name of ["SIGTERM", "SIGINT"] as const)
  process.on(name, () => {
    closing = true;
    for (const value of rooms.values()) value.abort?.abort();
    sockets.close();
    http.close();
    setTimeout(() => process.exit(0), 10_000).unref();
  });
http.listen(Number(process.env.RUNLY_RUNTIME_PORT || 4001), "127.0.0.1", () => {
  console.log(`Runly runtime gateway ${gatewayId} listening`);
  void work().catch((error) => {
    console.error("Runtime startup failed:", error.message);
    process.exit(1);
  });
});
