import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { startAndMigrateLocalSupabase } from "./supabase-local.mjs";

if (process.env.NODE_ENV === "production")
  throw new Error("Mock runtime is development-only");
const children = [];
let restoring = async () => {};
let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  await restoring().catch(() =>
    console.error(
      "Could not restore local mock policy. See runtime/LOCAL-MOCK.md.",
    ),
  );
  process.exitCode = code;
  setTimeout(() => process.exit(code), 2000).unref();
}
function launch(args, env) {
  const child = spawn(process.execPath, args, {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    void shutdown(1);
  });
  child.on("exit", (code) => {
    if (!closing) void shutdown(code || 1);
  });
  return child;
}
async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) =>
      code ? reject(new Error(`${command} failed (${code})`)) : resolve(),
    );
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => void shutdown());
async function main() {
  for (const port of [3000, 4001, 4002]) {
    await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.on("error", () =>
        reject(
          new Error(
            `Port ${port} is busy. Stop the existing dev service before starting mock mode.`,
          ),
        ),
      );
      probe.listen(port, "127.0.0.1", () => probe.close(resolve));
    });
  }
  console.log(
    "LOCAL MOCK MODE: real Linux execution; scripted agent; no OpenAI or Stripe calls.",
  );
  await run("docker", [
    "build",
    "-f",
    "runtime/mock.Dockerfile",
    "-t",
    "runly-runtime-mock:local",
    "runtime",
  ]);
  const local = await startAndMigrateLocalSupabase();
  if (!["127.0.0.1", "localhost"].includes(new URL(local.url).hostname))
    throw new Error("Refusing to seed a non-local database");
  const db = createClient(local.url, local.serviceRoleKey, {
    auth: { persistSession: false },
  });
  async function checked(query) {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }
  const email = "runtime-mock@runly.test",
    password = "Runly-Local-Mock-2026!";
  const users = await checked(db.auth.admin.listUsers({ perPage: 1000 }));
  let user = users.users.find((user) => user.email === email);
  if (user && !user.app_metadata?.runly_mock)
    throw new Error(
      "The mock account email is already used by a non-fixture account",
    );
  if (!user)
    user = (
      await checked(
        db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { runly_mock: true },
          user_metadata: { display_name: "Local Tester" },
        }),
      )
    ).user;
  await checked(
    db.from("subscription_plans").upsert(
      {
        id: "runtime-mock",
        name: "Local mock (no billing)",
        active: false,
        window_3h_tokens: 1000000,
        window_7d_tokens: 10000000,
      },
      { onConflict: "id" },
    ),
  );
  const originalPolicy = await checked(
    db.from("runtime_policy").select("*").eq("id", true).single(),
  );
  const originalProvider = await checked(
    db
      .from("provider_config")
      .select("emergency_stop")
      .eq("id", true)
      .maybeSingle(),
  );
  const entitlements = await checked(
    db
      .from("plan_entitlements")
      .select("id")
      .eq("user_id", user.id)
      .eq("plan_id", "runtime-mock"),
  );
  const entitlement =
    entitlements[0]?.id ||
    (
      await checked(
        db
          .from("plan_entitlements")
          .insert({ user_id: user.id, plan_id: "runtime-mock", active: false })
          .select("id")
          .single(),
      )
    ).id;
  restoring = async () => {
    await checked(
      db
        .from("plan_entitlements")
        .update({ active: false })
        .eq("id", entitlement),
    );
    await checked(
      db.from("runtime_policy").update(originalPolicy).eq("id", true),
    );
    if (originalProvider)
      await checked(
        db.from("provider_config").update(originalProvider).eq("id", true),
      );
  };
  await checked(
    db
      .from("plan_entitlements")
      .update({
        active: true,
        ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", entitlement),
  );
  await checked(
    db.from("runtime_policy").update({ enabled: true }).eq("id", true),
  );
  if (originalProvider)
    await checked(
      db
        .from("provider_config")
        .update({ emergency_stop: false })
        .eq("id", true),
    );
  const projects = await checked(
    db
      .from("projects")
      .select("id")
      .eq("owner_id", user.id)
      .eq("name", "Local runtime playground")
      .limit(1),
  );
  const project =
    projects[0] ||
    (await checked(
      db
        .from("projects")
        .insert({ owner_id: user.id, name: "Local runtime playground" })
        .select("id")
        .single(),
    ));
  const env = {
    ...process.env,
    NODE_ENV: "development",
    RUNLY_RUNTIME_MODE: "mock",
    RUNLY_LOCAL_SUPABASE: "true",
    NEXT_PUBLIC_SUPABASE_URL: local.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
    OPENAI_API_KEY: `runly-local-mock-${randomBytes(24).toString("hex")}`,
    OPENAI_MODEL: "local-scripted-agent",
    OPENAI_BASE_URL: "http://127.0.0.1:4002/v1",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    RUNLY_ENABLE_EXTERNAL_SERVICES: "false",
    RUNLY_RUNTIME_SECRET: randomBytes(32).toString("hex"),
    RUNLY_RUNTIME_GATEWAYS: JSON.stringify([
      { id: "local-mock", url: "ws://localhost:4001" },
    ]),
    RUNLY_RUNTIME_GATEWAY_ID: "local-mock",
    RUNLY_RUNTIME_PORT: "4001",
    RUNLY_SITE_URL: "http://localhost:3000",
    RUNLY_RUNTIME_MAX_ACTIVE: "3",
  };
  // Graceful worker exit leaves a short fencing lease. Wait before relaunching
  // the same shard rather than starting two owners or resetting its lease.
  const lease = await checked(
    db
      .from("runtime_gateway_leases")
      .select("expires_at")
      .eq("gateway_id", "local-mock")
      .maybeSingle(),
  );
  if (lease && Date.parse(lease.expires_at) > Date.now()) {
    const wait = Math.min(
      46000,
      Date.parse(lease.expires_at) - Date.now() + 500,
    );
    console.log(
      `Waiting ${Math.ceil(wait / 1000)}s for the previous local gateway lease…`,
    );
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  launch(["--import", "tsx", "runtime/mock-provider.ts"], env);
  // Wait for our authenticated provider, not an unrelated process on the port.
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) {
    ready = await fetch("http://127.0.0.1:4002/health", {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    })
      .then((r) => r.ok)
      .catch(() => false);
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Local mock provider failed to start");
  launch(["--import", "tsx", "runtime/gateway.ts"], env);
  launch(
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    env,
  );
  console.log(
    `\nLocal-only fixture login: ${email}\nPassword: ${password}\nProject: http://localhost:3000/project/${project.id}\nSend /mock demo to test the agent, then run the demo through Console.\nCtrl+C stops services and disables the fixture entitlement. Containers are retained for recovery.\n`,
  );
}
main().catch((error) => {
  console.error(error.message);
  void shutdown(1);
});
