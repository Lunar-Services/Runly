import { createSign } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.prod");
if (existsSync(envFile)) process.loadEnvFile(envFile);

function privateKey() {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.replaceAll(
    "\\n",
    "\n",
  ).trim();
  const pem = raw?.match(
    /^(-----BEGIN (RSA )?PRIVATE KEY-----)([\s\S]*)(-----END (RSA )?PRIVATE KEY-----)$/,
  );
  if (!pem || pem[2] !== pem[5])
    throw new Error("The GitHub App private key is incomplete.");
  const body = pem[3].replaceAll(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body))
    throw new Error("The GitHub App private key has an invalid body.");
  return `${pem[1]}\n${body.match(/.{1,64}/g)?.join("\n")}\n${pem[4]}\n`;
}

function appJwt() {
  if (!/^\d+$/.test(process.env.GITHUB_APP_ID || ""))
    throw new Error("GITHUB_APP_ID must be a number.");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: process.env.GITHUB_APP_ID,
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  return `${data}.${createSign("RSA-SHA256").update(data).sign(privateKey(), "base64url")}`;
}

async function github(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      `GitHub returned HTTP ${response.status}. Check the App ID and private key.`,
    );
  return response.json();
}

try {
  const token = appJwt();
  const app = await github("/app", token);
  if (app.slug !== process.env.GITHUB_APP_SLUG)
    throw new Error("GITHUB_APP_SLUG does not match this GitHub App.");
  const installations = await github("/app/installations?per_page=100", token);
  const personal = installations.filter(
    (item) => item.account?.type === "User",
  );
  console.log("GitHub App authentication and slug: OK");
  if (typeof app.public === "boolean")
    console.log(`Installable by any account: ${app.public ? "yes" : "no"}`);
  console.log(
    `Repository Contents permission: ${app.permissions?.contents || "none"}`,
  );
  console.log(`Personal account installations: ${personal.length}`);
  if (app.permissions?.contents !== "write")
    throw new Error(
      "Give the GitHub App Repository Contents read and write permission.",
    );
  if (!personal.length)
    throw new Error(
      "Install the GitHub App on a personal account and select repositories.",
    );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "GitHub App check failed.",
  );
  process.exitCode = 1;
}
