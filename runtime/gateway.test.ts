import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";
import { digest, signTicket } from "../src/lib/runtime/shared";

test(
  "gateway authenticates, relays commands, persists file events, and rejects cross-project tickets",
  { timeout: 25000 },
  async () => {
    const project = randomUUID(),
      user = randomUUID(),
      generation = randomUUID();
    const secret = "test-secret-only-".repeat(4),
      token = "sandbox-test-token";
    const persisted: unknown[] = [];
    const control = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const url = new URL(request.url!, "http://localhost");
      let data: unknown = null;
      if (url.pathname.startsWith("/auth/v1/admin/users/"))
        data = { id: user, email_confirmed_at: new Date().toISOString() };
      else if (url.pathname.endsWith("/lease_runtime_gateway")) data = true;
      else if (url.pathname.endsWith("/claim_runtime_job")) data = [];
      else if (url.pathname.endsWith("/projects"))
        data =
          url.searchParams.get("id") === `eq.${project}`
            ? { owner_id: user, workspace_id: null }
            : null;
      else if (url.pathname.endsWith("/project_runtimes"))
        data = url.searchParams.has("session_id")
          ? []
          : {
              project_id: project,
              gateway_id: "test",
              generation,
              bridge_token_hash: digest(token),
              state: "ready",
            };
      else if (url.pathname.endsWith("/runtime_policy"))
        data = { enabled: true };
      else if (url.pathname.endsWith("/plan_entitlements"))
        data = [{ id: randomUUID() }];
      else if (url.pathname.endsWith("/runtime_files")) {
        if (request.method === "POST") persisted.push(...JSON.parse(body));
        data = [];
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(data));
    });
    control.listen(0, "127.0.0.1");
    await once(control, "listening");
    const controlPort = (control.address() as { port: number }).port;
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const url = `ws://127.0.0.1:${port}`;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "runtime/gateway.ts"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          OPENAI_API_KEY: "test-key",
          OPENAI_MODEL: "test-model",
          OPENAI_BASE_URL: `http://127.0.0.1:${controlPort}/provider-must-not-be-called`,
          NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${controlPort}`,
          SUPABASE_SERVICE_ROLE_KEY: "test-key",
          RUNLY_RUNTIME_SECRET: secret,
          RUNLY_RUNTIME_GATEWAYS: JSON.stringify([{ id: "test", url }]),
          RUNLY_RUNTIME_GATEWAY_ID: "test",
          RUNLY_RUNTIME_PORT: String(port),
          RUNLY_PREVIEW_DOMAIN: "preview.example.test",
          RUNLY_SITE_URL: "http://localhost:3000",
        },
      },
    );
    let output = "";
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const connected: WebSocket[] = [];
    async function connect(
      role: "browser" | "bridge",
      overrides: Record<string, unknown> = {},
    ) {
      const ws = new WebSocket(url, { origin: "http://localhost:3000" });
      connected.push(ws);
      const frames: Record<string, unknown>[] = [];
      ws.on("message", (raw) => frames.push(JSON.parse(raw.toString())));
      await once(ws, "open");
      ws.send(
        JSON.stringify(
          role === "bridge"
            ? { type: "auth", role, project, generation, token, ...overrides }
            : {
                type: "auth",
                role,
                ticket: signTicket(
                  { project, user, gateway: "test", exp: Date.now() + 60000 },
                  secret,
                ),
                ...overrides,
              },
        ),
      );
      return { ws, frames };
    }
    async function until(predicate: () => boolean, description: string) {
      for (let i = 0; i < 100; i++) {
        if (predicate()) return;
        await delay(30);
      }
      assert.fail(`${description}: ${output}`);
    }
    try {
      let healthy = false;
      for (let i = 0; i < 100 && !healthy; i++) {
        healthy = await fetch(`http://127.0.0.1:${port}`)
          .then((r) => r.ok)
          .catch(() => false);
        if (!healthy) await delay(50);
      }
      assert.ok(healthy, output);
      const bridge = await connect("bridge");
      await until(
        () => bridge.frames.some((f) => f.type === "authenticated"),
        "bridge auth",
      );
      const browser = await connect("browser");
      await until(
        () => browser.frames.some((f) => f.type === "authenticated"),
        "browser auth",
      );
      bridge.ws.on("message", (raw) => {
        const command = JSON.parse(raw.toString());
        if (command.type === "preview.request") {
          bridge.ws.send(
            JSON.stringify({
              type: "preview.response",
              id: command.id,
              status: 200,
              headers: [
                ["content-type", "text/html; charset=utf-8"],
                ["set-cookie", "session=x; Domain=runly-ai.xyz; Path=/"],
              ],
              body: Buffer.from("<h1>Hosted app preview</h1>").toString(
                "base64",
              ),
            }),
          );
          return;
        }
        if (command.type !== "command") return;
        bridge.ws.send(
          JSON.stringify({
            type: "files.changed",
            full: true,
            deleted: [],
            files: [
              {
                path: "hello.ts",
                kind: "file",
                content: "hello",
                hash: digest("hello"),
              },
            ],
          }),
        );
        bridge.ws.send(
          JSON.stringify({
            type: "reply",
            id: command.id,
            result: { hash: digest("hello") },
          }),
        );
      });
      const id = randomUUID();
      browser.ws.send(
        JSON.stringify({
          type: "command",
          id,
          op: "write",
          path: "hello.ts",
          content: "hello",
          hash: "",
          create: true,
        }),
      );
      await until(
        () => browser.frames.some((f) => f.type === "reply" && f.id === id),
        "write acknowledgement",
      );
      assert.ok(
        persisted.length,
        "files must be backed up before acknowledgement",
      );
      assert.ok(browser.frames.some((f) => f.type === "files.changed"));
      bridge.ws.send(
        JSON.stringify({
          type: "app.status",
          running: true,
          previewUrl: `https://${"a".repeat(48)}.preview.example.test/`,
        }),
      );
      await until(
        () =>
          browser.frames.some(
            (frame) => frame.type === "app.status" && frame.running === true,
          ),
        "app status forwarding",
      );
      const preview = await new Promise<{
        status: number;
        body: string;
        headers: import("node:http").IncomingHttpHeaders;
      }>((resolve, reject) => {
        const outgoing = httpRequest(
          {
            hostname: "127.0.0.1",
            port,
            path: "/",
            headers: { host: `${"a".repeat(48)}.preview.example.test` },
          },
          (incoming) => {
            let body = "";
            incoming.setEncoding("utf8");
            incoming.on("data", (chunk) => (body += chunk));
            incoming.on("end", () =>
              resolve({
                status: incoming.statusCode || 0,
                body,
                headers: incoming.headers,
              }),
            );
          },
        );
        outgoing.on("error", reject);
        outgoing.end();
      });
      assert.equal(preview.status, 200, preview.body);
      assert.equal(preview.body, "<h1>Hosted app preview</h1>");
      assert.equal(preview.headers["content-security-policy"], undefined);
      assert.match(String(preview.headers["set-cookie"]), /session=x; Path=\//);
      assert.doesNotMatch(String(preview.headers["set-cookie"]), /Domain=/i);
      bridge.ws.send(
        JSON.stringify({
          type: "terminal.output",
          data: Buffer.from("shell output").toString("base64"),
        }),
      );
      await until(
        () => browser.frames.some((f) => f.type === "terminal.output"),
        "PTY forwarding",
      );
      const wrong = await connect("browser", {
        ticket: signTicket(
          {
            project: randomUUID(),
            user,
            gateway: "test",
            exp: Date.now() + 60000,
          },
          secret,
        ),
      });
      await until(
        () => wrong.ws.readyState === WebSocket.CLOSED,
        "cross-project rejection",
      );
      const badBridge = await connect("bridge", { token: "wrong-token" });
      await until(
        () => badBridge.ws.readyState === WebSocket.CLOSED,
        "sandbox token rejection",
      );
    } finally {
      for (const ws of connected) ws.terminate();
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => control.close(() => resolve()));
    }
  },
);
