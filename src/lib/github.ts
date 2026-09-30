import "server-only";
import { createPrivateKey, createSign } from "node:crypto";
import { ApiError } from "@/lib/api";
import type { SupabaseClient } from "@supabase/supabase-js";

export type GithubRepository = {
  id: number;
  full_name: string;
  clone_url: string;
  default_branch: string;
  private: boolean;
  archived: boolean;
};

export async function linkedGithubUserId(
  db: SupabaseClient,
): Promise<number | null> {
  const { data, error } = await db.auth.getUserIdentities();
  if (error) throw new ApiError(502, "Couldn't check linked GitHub account.");
  const identity = data?.identities?.find((item) => item.provider === "github");
  const raw =
    identity?.identity_data?.provider_id ??
    identity?.identity_data?.sub ??
    identity?.id;
  const id = Number(raw);
  return identity && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function configuration() {
  const id = process.env.GITHUB_APP_ID;
  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.replaceAll(
    "\\n",
    "\n",
  ).trim();
  if (!id || !raw) throw new ApiError(503, "GitHub App is not configured.");
  // Accept a normal multiline PEM or a copied one-line PEM from .env.prod.
  const pem = raw.match(
    /^(-----BEGIN (RSA )?PRIVATE KEY-----)([\s\S]*)(-----END (RSA )?PRIVATE KEY-----)$/,
  );
  if (!pem || pem[2] !== pem[5])
    throw new ApiError(503, "GitHub App private key is not a valid PEM.");
  const body = pem[3].replaceAll(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body))
    throw new ApiError(503, "GitHub App private key is not a valid PEM.");
  const key = `${pem[1]}\n${body.match(/.{1,64}/g)?.join("\n")}\n${pem[4]}\n`;
  try {
    createPrivateKey(key);
  } catch {
    throw new ApiError(503, "GitHub App private key is not a valid PEM.");
  }
  return { id, key };
}

function appJwt() {
  const { id, key } = configuration();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: id }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(input)
    .sign(key, "base64url");
  return `${input}.${signature}`;
}

async function github<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new ApiError(
      response.status === 404 ? 404 : 502,
      response.status === 404
        ? "GitHub installation or repository was not found."
        : "GitHub is unavailable or the app lacks repository permission.",
    );
  return response.json() as Promise<T>;
}

export async function installation(id: number) {
  return github<{
    id: number;
    account: { id: number; login: string; type: string };
  }>(`/app/installations/${id}`, appJwt());
}

export async function installationToken(id: number, repositoryId?: number) {
  const result = await github<{ token: string; expires_at: string }>(
    `/app/installations/${id}/access_tokens`,
    appJwt(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        repositoryId ? { repository_ids: [repositoryId] } : {},
      ),
    },
  );
  return result.token;
}

export async function installationRepositories(id: number) {
  const token = await installationToken(id);
  const result: GithubRepository[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await github<{ repositories: GithubRepository[] }>(
      `/installation/repositories?per_page=100&page=${page}`,
      token,
    );
    result.push(...batch.repositories);
    if (batch.repositories.length < 100) break;
  }
  return result;
}
