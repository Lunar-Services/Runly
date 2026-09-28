// Run after pnpm dev:mock. Uses the actual Next API, cookies, DB, gateway and Docker.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { setTimeout as delay } from "node:timers/promises";
const origin = "http://localhost:3000";
const cookies = new Map();
async function api(path, body) {
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(`${path}: ${result.message || response.status}`);
  return result;
}
async function until(check, label, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(250);
  }
  throw new Error(`Timed out: ${label}`);
}
await api("/api/auth/login", {
  email: "runtime-mock@runly.test",
  password: "Runly-Local-Mock-2026!",
});
const project = (await api("/api/projects")).projects.find(
  (p) => p.name === "Local runtime playground",
);
assert.ok(project, "Mock fixture project missing");
const base = `/api/projects/${project.id}`;
let runtime = await api(`${base}/runtime`);
assert.equal(runtime.mode, "mock", "Refusing to run against a live provider");
if (runtime.state !== "ready")
  await api(`${base}/runtime`, { action: "start", requestId: randomUUID() });
await until(async () => {
  runtime = await api(`${base}/runtime`);
  if (runtime.state === "error") throw new Error(runtime.error);
  return runtime.state === "ready";
}, "workspace ready");
console.log(
  "PASS: authenticated API → durable job → real Docker sandbox → gateway",
);
const ws = new WebSocket(runtime.connection.url, { origin });
const frames = [];
const pending = new Map();
ws.on("message", (raw) => {
  const frame = JSON.parse(raw.toString());
  frames.push(frame);
  const promise = pending.get(frame.id);
  if (frame.type === "reply" && promise) {
    pending.delete(frame.id);
    clearTimeout(promise.timer);
    if (frame.error) promise.reject(new Error(frame.error));
    else promise.resolve(frame.result);
  }
});
await new Promise((resolve, reject) => {
  ws.once("open", resolve);
  ws.once("error", reject);
});
ws.send(
  JSON.stringify({
    type: "auth",
    role: "browser",
    ticket: runtime.connection.ticket,
  }),
);
await until(
  () => frames.some((f) => f.type === "authenticated"),
  "socket authentication",
);
function command(op, fields = {}) {
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${op} timed out`));
    }, 35000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ type: "command", id, op, ...fields }));
  });
}
async function agent(message) {
  const result = await api(`${base}/messages`, {
    message,
    requestId: randomUUID(),
  });
  await until(
    () =>
      frames.some(
        (f) =>
          f.type === "job.status" &&
          f.id === result.jobId &&
          ["completed", "failed"].includes(f.state),
      ),
    message,
    60000,
  );
  return {
    ...result,
    status: frames.findLast(
      (f) => f.type === "job.status" && f.id === result.jobId,
    ),
  };
}
const path = `smoke-${randomUUID()}.txt`;
let renamed = false;
try {
  let result = await command("write", {
    path,
    content: "real file 🐱\n",
    hash: "",
    create: true,
  });
  assert.equal((await command("read", { path })).content, "real file 🐱\n");
  await assert.rejects(
    command("write", { path, content: "stale", hash: "" }),
    /changed/,
  );
  await command("rename", { path, to: `moved-${path}`, hash: result.hash });
  renamed = true;
  assert.equal(
    (await command("read", { path: `moved-${path}` })).content,
    "real file 🐱\n",
  );
  console.log("PASS: create, read, stale-write rejection and move");
  result = await agent("/mock demo");
  assert.equal(result.status.state, "completed", result.status.error);
  assert.ok(
    (await command("read", { path: "mock-demo/server.cjs" })).content.includes(
      "createServer",
    ),
  );
  const chat = await api(`${base}?chat=${result.conversationId}`);
  assert.ok(
    chat.messages.some(
      (m) => m.role === "assistant" && m.body.includes("Local mock agent"),
    ),
  );
  console.log(
    "PASS: scripted provider events → persisted assistant message + actual files",
  );
  await command("terminal.open");
  await command("terminal.input", {
    data: "printf '__RUNLY_SMOKE_TERMINAL__\\n'\n",
  });
  const terminal = () =>
    frames
      .filter((f) => f.type === "terminal.output")
      .map((f) => Buffer.from(f.data, "base64").toString())
      .join("");
  await until(
    () => terminal().includes("__RUNLY_SMOKE_TERMINAL__\r\n"),
    "PTY output",
    10000,
  ).catch((error) => {
    throw new Error(`${error.message}: ${JSON.stringify(terminal())}`);
  });
  await command("app.start", { command: "cd mock-demo && npm run dev" });
  await until(
    () =>
      frames.some(
        (f) => f.type === "console.output" && f.data.includes("Demo listening"),
      ),
    "application logs",
  );
  await command("terminal.input", { data: "curl -s http://localhost:3000\n" });
  await until(
    () => terminal().includes("Hello from the real local sandbox!"),
    "real HTTP application response",
  );
  await command("app.stop");
  console.log(
    "PASS: PTY, real Node application, HTTP request and console logs",
  );
  result = await agent("/mock fail");
  assert.equal(result.status.state, "failed");
  const slow = await api(`${base}/messages`, {
    message: "/mock slow",
    requestId: randomUUID(),
  });
  await until(
    () =>
      frames.some(
        (f) =>
          f.type === "job.status" &&
          f.id === slow.jobId &&
          f.state === "running",
      ),
    "slow agent running",
  );
  await delay(1500);
  await command("agent.cancel");
  await until(
    () =>
      frames.some(
        (f) =>
          f.type === "job.status" &&
          f.id === slow.jobId &&
          f.state === "failed",
      ),
    "cancelled job settled",
  );
  console.log("PASS: provider failure and cancellation");
  await api(`${base}/runtime`, { action: "stop", requestId: randomUUID() });
  await until(
    async () => (await api(`${base}/runtime`)).state === "stopped",
    "workspace stopped",
  );
  await api(`${base}/runtime`, { action: "start", requestId: randomUUID() });
  await until(
    async () => (await api(`${base}/runtime`)).state === "ready",
    "workspace restored",
  );
  assert.equal(
    (await command("read", { path: `moved-${path}` })).content,
    "real file 🐱\n",
  );
  console.log("PASS: stop → fresh container → database snapshot restore");
} finally {
  try {
    const target = renamed ? `moved-${path}` : path;
    const file = await command("read", { path: target });
    await command("delete", { path: target, hash: file.hash });
  } catch {
    /* Keep failed-test files available for investigation. */
  }
  ws.close();
}
