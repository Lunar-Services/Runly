/** Local-only provider emulator. Real Docker filesystem/processes; scripted AI. */
import { createServer, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { validWorkspacePath } from "../src/lib/runtime/shared";

if (
  process.env.NODE_ENV === "production" ||
  process.env.RUNLY_RUNTIME_MODE !== "mock"
)
  throw new Error("The mock provider is local-development only");
const key = process.env.OPENAI_API_KEY;
if (!key?.startsWith("runly-local-mock-"))
  throw new Error("Use the mock launcher, never real provider credentials");
const image = "runly-runtime-mock:local";
type Turn = {
  id: string;
  session_id: string;
  subagent_id: null;
  status: string;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  created_at: number;
};
type State = {
  id: string;
  turns: Turn[];
  items: Record<string, unknown>[];
  requests: string[];
};
const states = new Map<string, State>();
const streams = new Map<string, Set<ServerResponse>>();
const name = (id: string) => {
  if (!/^mock-[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid mock session");
  return `runly-${id}`;
};
function docker(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "",
      err = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Docker operation timed out"));
    }, 45000);
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code)
        reject(new Error(err.slice(0, 500) || "Docker operation failed"));
      else resolve(out);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
const save = (state: State) =>
  docker(
    [
      "exec",
      "-i",
      name(state.id),
      "python",
      "-c",
      "import sys,pathlib; pathlib.Path('/workspace/.runly/mock-state.json').write_text(sys.stdin.read())",
    ],
    JSON.stringify(state),
  );
async function stateFor(id: string) {
  let state = states.get(id);
  if (!state) {
    state = JSON.parse(
      await docker([
        "exec",
        name(id),
        "cat",
        "/workspace/.runly/mock-state.json",
      ]),
    ) as State;
    if (
      state.id !== id ||
      !Array.isArray(state.turns) ||
      !Array.isArray(state.items) ||
      !Array.isArray(state.requests)
    )
      throw new Error("Invalid saved mock session");
    states.set(id, state);
  }
  return state;
}
function emit(id: string, event: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    event_id: randomUUID(),
    session_id: id,
    ...event,
  };
  for (const response of streams.get(id) || []) {
    if (response.writableLength > 256000) {
      response.destroy();
      continue;
    }
    response.write(
      `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`,
    );
  }
}
const createSchema = z.object({
  environment: z.object({
    env: z.object({
      RUNLY_PROJECT_ID: z.string().uuid(),
      RUNLY_GENERATION: z.string().uuid(),
      RUNLY_BRIDGE_TOKEN: z.string().regex(/^[a-f0-9]{64}$/),
    }),
    files: z.array(z.object({ path: z.string(), data: z.string() })).max(1001),
    setup_commands: z
      .array(z.object({ command: z.string().max(100000) }))
      .optional(),
  }),
  metadata: z.record(z.string(), z.string()).optional(),
});
async function createSession(body: unknown) {
  const request = createSchema.parse(body);
  const id = `mock-${randomUUID()}`;
  const state: State = { id, turns: [], items: [], requests: [] };
  const files = request.environment.files.filter(
    (file) => file.path !== "/workspace/.runly/bridge.py",
  );
  // Decode the gateway's folder manifest without evaluating setup shell code.
  const encodedFolders = /base64\.b64decode\('([A-Za-z0-9+/=]+)'\)/.exec(
    request.environment.setup_commands?.[0]?.command || "",
  )?.[1];
  const folders = z
    .array(z.string().refine(validWorkspacePath))
    .max(1000)
    .parse(
      encodedFolders
        ? JSON.parse(Buffer.from(encodedFolders, "base64").toString())
        : [],
    );
  for (const file of files)
    if (
      !file.path.startsWith("/workspace/project/") ||
      !validWorkspacePath(file.path.slice(19))
    )
      throw new Error("Unsafe restore path");
  await docker([
    "run",
    "-d",
    "--name",
    name(id),
    "--label",
    "runly.runtime.mock=true",
    "--init",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--memory=1g",
    "--cpus=1",
    "--pids-limit=128",
    "--tmpfs",
    "/workspace:rw,uid=1000,gid=1000,mode=0700,size=256m",
    "--tmpfs",
    "/tmp:rw,uid=1000,gid=1000,mode=1777,size=64m",
    "--add-host",
    "host.docker.internal:host-gateway",
    "--publish",
    "127.0.0.1::3000/tcp",
    image,
  ]);
  try {
    const published = await docker(["port", name(id), "3000/tcp"]);
    const match = /^127\.0\.0\.1:(\d+)\s*$/m.exec(published);
    if (!match) throw new Error("Could not reserve a local preview port");
    const previewUrl = `http://127.0.0.1:${match[1]}/`;
    const bootstrap =
      "import sys,json,os,pathlib,base64,subprocess; d=json.load(sys.stdin); r=pathlib.Path('/workspace/project'); r.mkdir(exist_ok=True); pathlib.Path('/workspace/.runly').mkdir(exist_ok=True); [(r/p).mkdir(parents=True,exist_ok=True) for p in d['folders']]; [(pathlib.Path(f['path']).parent.mkdir(parents=True,exist_ok=True),pathlib.Path(f['path']).write_bytes(base64.b64decode(f['data']))) for f in d['files']]; subprocess.Popen(['python','/opt/runly/bridge.py'],env={**os.environ,**d['env']},stdin=subprocess.DEVNULL,stdout=open('/tmp/bridge.log','a'),stderr=subprocess.STDOUT,start_new_session=True)";
    await docker(
      ["exec", "-i", name(id), "python", "-c", bootstrap],
      JSON.stringify({
        files,
        folders,
        env: {
          ...request.environment.env,
          RUNLY_GATEWAY_URL: "ws://host.docker.internal:4001",
          RUNLY_PREVIEW_URL: previewUrl,
        },
      }),
    );
    states.set(id, state);
    await save(state);
    return {
      id,
      object: "agent.session",
      environment: { type: "openai_hosted", id, status: "connected" },
    };
  } catch (error) {
    await docker(["rm", "-f", name(id)]).catch(() => undefined);
    throw error;
  }
}
async function execute(state: State, text: string, requestId: string) {
  if (state.requests.includes(requestId)) return;
  if (state.turns.some((turn) => turn.status === "in_progress"))
    throw new Error("A mock turn is already running");
  state.requests.push(requestId);
  const turn: Turn = {
    id: `turn-${randomUUID()}`,
    session_id: state.id,
    subagent_id: null,
    status: "in_progress",
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    created_at: Math.floor(Date.now() / 1000),
  };
  state.turns.unshift(turn);
  await save(state);
  emit(state.id, { type: "agent.session.turn.created", turn });
  try {
    const prompt = text.split("\n\nCurrent request:\n").pop()!.trim();
    // Deterministic fixtures, never execute a user prompt as host/container shell.
    for (let i = 0; i < (prompt === "/mock slow" ? 60 : 3); i++) {
      await delay(300);
      if (turn.status !== "in_progress") return;
    }
    if (prompt === "/mock fail")
      throw new Error("Intentional mock provider failure");
    if (prompt === "/mock disconnect") {
      for (const stream of streams.get(state.id) || []) stream.destroy();
      await delay(5000);
      if (turn.status !== "in_progress") return;
    }
    let answer =
      "[Local mock agent — no model called] Try /mock next for a small Next.js page with a live API route, /mock demo for a dependency-free Node server, /mock write path/to/file.txt followed by a newline and its contents, /mock slow, /mock fail, or /mock disconnect.";
    let files: Record<string, string> = {};
    if (prompt === "/mock next") {
      files = {
        "mock-next/package.json": JSON.stringify(
          {
            name: "runly-mock-next-demo",
            private: true,
            scripts: { dev: "next dev" },
            dependencies: {
              next: "16.3.6",
              react: "19.2.8",
              "react-dom": "19.2.8",
            },
          },
          null,
          2,
        ),
        "mock-next/app/layout.js": `import "./globals.css";

export const metadata = {
  title: "Runly Next.js Preview",
  description: "A small full-stack app running in the Runly mock workspace.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
        "mock-next/app/page.js": `"use client";

import { useState } from "react";

export default function Home() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function checkBackend() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error("The API request failed.");
      setResult(await response.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <p className="eyebrow">RUNLY · LOCAL MOCK</p>
        <h1>Your Next.js app is live.</h1>
        <p className="intro">
          This page is rendered by Next.js. Click below to call its backend API
          route from your browser.
        </p>
        <button onClick={checkBackend} disabled={loading}>
          {loading ? "Calling API…" : "Test backend"}
        </button>
        {error && <p className="error">{error}</p>}
        {result && (
          <pre aria-live="polite">{JSON.stringify(result, null, 2)}</pre>
        )}
        <p className="hint">Frontend: app/page.js · Backend: app/api/status/route.js</p>
      </section>
    </main>
  );
}
`,
        "mock-next/app/api/status/route.js": `export async function GET() {
  return Response.json({
    ok: true,
    message: "Hello from the Next.js backend route!",
    servedAt: new Date().toISOString(),
  });
}
`,
        "mock-next/app/globals.css": `* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: #f3f5f4; color: #14231d; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.shell { min-height: 100vh; display: grid; place-items: center; padding: 32px; }
.card { width: min(100%, 620px); padding: 44px; border: 1px solid #dce4df; border-radius: 20px; background: white; box-shadow: 0 20px 60px #12321c12; }
.eyebrow { color: #287a50; font-size: 12px; font-weight: 700; letter-spacing: .14em; }
h1 { margin: 22px 0 12px; font-size: clamp(32px, 6vw, 52px); letter-spacing: -.045em; }
.intro { color: #5d6b63; line-height: 1.7; }
button { margin-top: 18px; padding: 12px 18px; border: 0; border-radius: 9px; background: #18794e; color: white; font: inherit; font-weight: 650; cursor: pointer; }
button:disabled { opacity: .65; cursor: wait; }
pre { overflow: auto; margin-top: 20px; padding: 16px; border-radius: 10px; background: #10251b; color: #c8f5d7; }
.error { color: #b42318; }
.hint { margin-top: 26px; color: #849188; font-size: 12px; }
`,
      };
      answer =
        "[Local mock agent — no model called] Created mock-next, a small Next.js App Router app. Preview will install its three dependencies in the sandbox and run it. The page is the frontend; app/api/status/route.js is a real backend route. Click “Test backend” in Preview to verify the full-stack request.";
    } else if (prompt === "/mock demo") {
      files = {
        "mock-demo/package.json": JSON.stringify(
          {
            name: "runly-local-demo",
            private: true,
            scripts: { dev: "node server.cjs" },
          },
          null,
          2,
        ),
        "mock-demo/server.cjs":
          "const http = require('node:http'); const server = http.createServer((req,res)=>{ console.log(req.method,req.url); res.end('Hello from the real local sandbox!'); }); server.listen(3000,'0.0.0.0',()=>console.log('Demo listening on port 3000')); setInterval(()=>console.log('Demo heartbeat'),3000);\n",
        "mock-demo/README.md":
          "# Local mock demo\nRun: cd mock-demo && npm run dev\nUse the other terminal: curl http://localhost:3000\n",
      };
      answer =
        "[Local mock agent — no model called] Created mock-demo/package.json, server.cjs and README.md in the real sandbox. Select Preview to start and display the app automatically. In Terminal run: curl http://localhost:3000. No dependency installation is needed.";
    } else if (prompt.startsWith("/mock write ")) {
      const match = /^\/mock write ([^\n]+)\n([\s\S]*)$/.exec(prompt);
      if (
        !match ||
        !validWorkspacePath(match[1]) ||
        Buffer.byteLength(match[2]) > 1048576
      )
        throw new Error(
          "Use /mock write relative/path then a newline and UTF-8 contents (max 1 MiB)",
        );
      files = { [match[1]]: match[2] };
      answer = `[Local mock agent — no model called] Wrote ${match[1]} in the shared sandbox.`;
    }
    if (Object.keys(files).length) {
      const script =
        "import sys,json,pathlib; r=pathlib.Path('/workspace/project'); d=json.load(sys.stdin); paths=[(r/p,c) for p,c in d.items()]; assert all(p.resolve().is_relative_to(r) and not any(a.is_symlink() for a in [p,*p.parents]) for p,c in paths); [(p.parent.mkdir(parents=True,exist_ok=True),p.write_text(c)) for p,c in paths]";
      await docker(
        ["exec", "-i", name(state.id), "python", "-c", script],
        JSON.stringify(files),
      );
    }
    const itemId = `message-${randomUUID()}`;
    for (const delta of answer.match(/[\s\S]{1,24}/g) || []) {
      if (turn.status !== "in_progress") return;
      emit(state.id, {
        type: "agent.session.turn.output_text.delta",
        turn_id: turn.id,
        item_id: itemId,
        content_index: 0,
        delta,
      });
      await delay(60);
    }
    emit(state.id, {
      type: "agent.session.turn.output_text.done",
      turn_id: turn.id,
      item_id: itemId,
      content_index: 0,
      text: answer,
    });
    state.items.unshift({
      id: itemId,
      type: "message",
      role: "assistant",
      phase: "final_answer",
      turn_id: turn.id,
      content: [{ type: "output_text", text: answer }],
    });
    turn.status = "completed";
    await save(state);
    emit(state.id, { type: "agent.session.turn.completed", turn });
  } catch {
    if (turn.status !== "in_progress") return;
    turn.status = "failed";
    await save(state);
    emit(state.id, { type: "agent.session.turn.failed", turn });
  }
}
const server = createServer(async (request, response) => {
  const reply = (status: number, data: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(data));
  };
  try {
    if (
      request.headers.authorization !== `Bearer ${key}` ||
      request.headers.origin
    ) {
      reply(401, { error: { message: "Local mock authentication required" } });
      return;
    }
    const path = new URL(request.url!, "http://localhost").pathname;
    if (path === "/health") {
      reply(200, { mode: "mock" });
      return;
    }
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 12000000) throw new Error("Request too large");
    }
    const body = raw ? JSON.parse(raw) : {};
    if (path === "/v1/agents/sessions" && request.method === "POST") {
      reply(200, await createSession(body));
      return;
    }
    const match =
      /^\/v1\/agents\/(sessions|environments)\/(mock-[a-f0-9-]{36})(?:\/(events|items|turns)(?:\/(turn-[a-f0-9-]{36}))?)?$/.exec(
        path,
      );
    if (!match) {
      reply(404, { error: { message: "Mock endpoint not implemented" } });
      return;
    }
    const [, resource, id, sub, turnId] = match;
    const state = await stateFor(id);
    if (resource === "environments") {
      reply(200, { id, status: "connected" });
      return;
    }
    if (request.method === "DELETE") {
      await docker(["rm", "-f", name(id)]);
      states.delete(id);
      reply(200, { id, deleted: true });
      return;
    }
    if (sub === "events" && request.method === "GET") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      });
      response.flushHeaders();
      response.write(": connected\n\n");
      const clients = streams.get(id) || new Set<ServerResponse>();
      streams.set(id, clients);
      clients.add(response);
      const heartbeat = setInterval(
        () => response.write(": heartbeat\n\n"),
        10000,
      );
      response.on("close", () => {
        clearInterval(heartbeat);
        clients.delete(response);
      });
      return;
    }
    if (sub === "events" && request.method === "POST") {
      for (const event of body.events || []) {
        if (event.type === "agent.session.input.cancel") {
          const turn = state.turns.find(
            (turn) => turn.status === "in_progress",
          );
          if (turn) {
            turn.status = "cancelled";
            await save(state);
            emit(id, { type: "agent.session.turn.cancelled", turn });
          }
        } else if (event.type === "agent.session.input.message") {
          const text = event.input?.[0]?.content?.[0]?.text;
          if (typeof text !== "string") throw new Error("Invalid mock input");
          void execute(
            state,
            text,
            String(request.headers["idempotency-key"] || randomUUID()),
          ).catch(() =>
            console.error("Mock task failed; inspect local container"),
          );
        }
      }
      response.writeHead(202);
      response.end();
      return;
    }
    if (sub === "items") {
      reply(200, { object: "list", data: state.items, has_more: false });
      return;
    }
    if (sub === "turns") {
      reply(
        200,
        turnId
          ? state.turns.find((turn) => turn.id === turnId)
          : { object: "list", data: state.turns, has_more: false },
      );
      return;
    }
    reply(200, { id, environment: { id, type: "openai_hosted" } });
  } catch (error) {
    reply(500, {
      error: {
        message:
          error instanceof Error ? error.message : "Mock operation failed",
      },
    });
  }
});
server.listen(4002, "127.0.0.1", () =>
  console.log(
    "Local mock provider listening on 127.0.0.1:4002 (no OpenAI requests)",
  ),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    for (const clients of streams.values())
      for (const client of clients) client.end();
    server.close();
  });
