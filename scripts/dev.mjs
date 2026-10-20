import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { startAndMigrateLocalSupabase } from "./supabase-local.mjs";
import nextEnv from "@next/env";
import { startLocalStripeListener } from "./stripe-local.mjs";

// Load the same env files Next uses, before applying local Supabase overrides.
nextEnv.loadEnvConfig(process.cwd(), true);

const local = await startAndMigrateLocalSupabase();
// Stable local encryption enables configuration editing without ever reusing a
// hosted deployment's credential key. Keep this file in ignored runtime state.
const localState = join(process.cwd(), ".supabase-local");
mkdirSync(localState, { recursive: true });
const credentialKeyPath = join(localState, "credential-key");
if (!existsSync(credentialKeyPath))
  writeFileSync(credentialKeyPath, randomBytes(32).toString("hex"), {
    mode: 0o600,
    flag: "wx",
  });
const localCredentialKey = readFileSync(credentialKeyPath, "utf8").trim();
if (!/^[a-f\d]{64}$/i.test(localCredentialKey))
  throw new Error(
    "The local credential key is invalid. Restore .supabase-local/credential-key before starting development.",
  );
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
  RUNLY_SITE_URL: "http://localhost:3000",
  RUNLY_LOCAL_SUPABASE: "true",
  RUNLY_CREDENTIAL_ENCRYPTION_KEY: localCredentialKey,
};

// Local development must not accidentally charge customers or call a real AI
// provider configured in .env.local. `pnpm dev:stripe` is an explicit opt-in
// for Stripe test-mode webhook work; normal `pnpm dev` remains isolated.
const externalServicesEnabled =
  process.argv.includes("--external-services") ||
  process.env.RUNLY_ENABLE_EXTERNAL_SERVICES === "true";
const stripeEnabled =
  process.argv.includes("--stripe") || externalServicesEnabled;
if (
  stripeEnabled &&
  environment.STRIPE_SECRET_KEY &&
  !environment.STRIPE_SECRET_KEY.startsWith("sk_test_")
)
  throw new Error(
    "Local development only accepts a Stripe test-mode secret key.",
  );

if (!stripeEnabled) {
  environment.STRIPE_SECRET_KEY = "";
  environment.STRIPE_WEBHOOK_SECRET = "";
}
if (!externalServicesEnabled) {
  environment.OPENAI_API_KEY = "";
  environment.OPENAI_MODEL = "";
}

const stripeListener =
  process.argv.includes("--stripe") && environment.STRIPE_SECRET_KEY
    ? await startLocalStripeListener(environment.STRIPE_SECRET_KEY)
    : null;
if (stripeListener) {
  environment.STRIPE_WEBHOOK_SECRET = stripeListener.signingSecret;
  console.log(
    "Stripe test webhook forwarding is ready; no secret values are written to logs or .env files.",
  );
}

const child = spawn(next, ["dev"], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
  shell: process.platform === "win32",
  windowsHide: true,
});
console.log(
  "Local services: app http://localhost:3000 · Studio http://localhost:54323 · email inbox http://localhost:54324",
);
if (!process.argv.includes("--runtime"))
  console.log(
    "Sandbox execution is not started. Projects, files and conversations use local Supabase.",
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
    stripeListener?.stop();
    runtime?.kill();
    child.kill();
  });
child.on("error", (error) => {
  stripeListener?.stop();
  throw error;
});
child.on("close", (code) => {
  stripeListener?.stop();
  runtime?.kill();
  process.exit(code ?? 0);
});
