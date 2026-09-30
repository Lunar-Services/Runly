import { spawn } from "node:child_process";
import { resolve } from "node:path";

// Every production entry point, including the standalone gateway, must use
// production-only safety gates even when the service manager omits NODE_ENV.
process.env.NODE_ENV = "production";
const envPath = resolve(
  process.cwd(),
  process.env.RUNLY_PROD_ENV_FILE?.trim() || ".env.prod",
);
process.loadEnvFile(envPath);

const nextCli = resolve("node_modules/next/dist/bin/next");
const port = process.env.PORT?.trim() || "3000";
const hostname = process.env.HOSTNAME?.trim() || "127.0.0.1";
const commands = {
  build: [nextCli, "build"],
  start: [nextCli, "start", "--hostname", hostname, "--port", port],
  runtime: ["--import", "tsx", "runtime/gateway.ts"],
};

const [command, ...extraArgs] = process.argv.slice(2);
if (!commands[command]) {
  console.error("Usage: node scripts/prod.mjs <build|start|runtime>");
  process.exit(2);
}

if (command === "runtime") {
  // GitHub credentials belong to the trusted web broker. The gateway relays
  // untrusted sandbox traffic and has no reason to hold them in either process.
  for (const name of Object.keys(process.env))
    if (name.startsWith("GITHUB_") || name.startsWith("STRIPE_"))
      delete process.env[name];
}
const childEnv = { ...process.env };

const child = spawn(process.execPath, [...commands[command], ...extraArgs], {
  env: childEnv,
  stdio: "inherit",
  windowsHide: true,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`Unable to start production ${command}:`, error);
  process.exitCode = 1;
});
child.on("close", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
