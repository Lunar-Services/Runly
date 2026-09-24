import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const command = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);

function run(args, { capture = false, env = process.env } = {}) {
  if (!existsSync(command))
    throw new Error("Supabase CLI is missing. Run pnpm install first.");
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      shell: process.platform === "win32",
    });
    let output = "";
    if (capture)
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else
        reject(
          new Error(
            `Supabase ${args.join(" ")} exited with code ${code}.${args[0] === "start" ? " Start Docker Desktop and wait until its Linux engine is running." : ""}`,
          ),
        );
    });
  });
}

function parseEnvironment(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(?:"(.*)"|'(.*)'|(.*))$/);
    if (match) values[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return values;
}

export async function startAndMigrateLocalSupabase() {
  await run(["start"]);
  await run(["migration", "up", "--local"]);
  const values = parseEnvironment(
    await run(["status", "--output", "env"], { capture: true }),
  );
  const publishableKey = values.PUBLISHABLE_KEY || values.ANON_KEY;
  if (!values.API_URL || !publishableKey || !values.SERVICE_ROLE_KEY)
    throw new Error("Local Supabase did not return its API URL and keys.");
  return {
    url: values.API_URL,
    publishableKey,
    serviceRoleKey: values.SERVICE_ROLE_KEY,
  };
}

export async function runSupabase(args) {
  return run(args);
}
