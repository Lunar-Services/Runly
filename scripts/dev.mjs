import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startAndMigrateLocalSupabase } from "./supabase-local.mjs";
import nextEnv from "@next/env";

// Load the same env files Next uses, before applying local Supabase overrides.
nextEnv.loadEnvConfig(process.cwd(), true);

const local = await startAndMigrateLocalSupabase();
const next = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next",
);
if (!existsSync(next))
  throw new Error("Next.js is missing. Run pnpm install first.");

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: local.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
  RUNLY_SITE_URL: "http://127.0.0.1:3001",
  RUNLY_LOCAL_SUPABASE: "true",
};

// Local development must not accidentally charge customers or call a real AI
// provider configured in .env.local. `pnpm dev:stripe` is an explicit opt-in
// for Stripe test-mode webhook work; normal `pnpm dev` remains isolated.
const externalServicesEnabled =
  process.argv.includes("--external-services") ||
  process.env.RUNLY_ENABLE_EXTERNAL_SERVICES === "true";
const stripeEnabled =
  process.argv.includes("--stripe") || externalServicesEnabled;

if (!stripeEnabled) {
  environment.STRIPE_SECRET_KEY = "";
  environment.STRIPE_WEBHOOK_SECRET = "";
}
if (!externalServicesEnabled) {
  environment.OPENAI_API_KEY = "";
  environment.OPENAI_MODEL = "";
}

const child = spawn(
  next,
  ["dev", "--hostname", "127.0.0.1", "--port", "3001"],
  {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
// Both services receive the same local database credentials. The explicit flag
// allows real provider spending; normal `pnpm dev` never launches this worker.
const runtime = process.argv.includes("--runtime")
  ? spawn(process.execPath, ["--import", "tsx", "runtime/gateway.ts"], {
      cwd: process.cwd(),
      env: environment,
      stdio: "inherit",
    })
  : null;
runtime?.on("error", (error) => {
  console.error("Runtime failed to start", error.message);
  child.kill();
});
runtime?.on("exit", (code) => {
  if (code) {
    console.error("Runtime exited; stopping the dev server.");
    child.kill();
  }
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    runtime?.kill();
    child.kill();
  });
child.on("error", (error) => {
  throw error;
});
child.on("close", (code) => {
  runtime?.kill();
  process.exit(code ?? 0);
});
