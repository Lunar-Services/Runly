import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api";

export type SourceFile = {
  path: string;
  kind: "file" | "folder";
  content: string;
  hash: string;
};

export async function internalFiles(
  input:
    | { project: string; user: string; action: "snapshot" }
    | {
        project: string;
        user: string;
        action: "replace";
        expected: SourceFile[];
        files: SourceFile[];
      },
) {
  const base = process.env.RUNLY_RUNTIME_INTERNAL_URL;
  const secret = process.env.RUNLY_RUNTIME_SECRET;
  if (!base || !secret || secret.length < 32)
    throw new ApiError(503, "Private runtime connection is not configured.");
  const endpoint = new URL("/internal/files", base);
  if (
    endpoint.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)
  )
    throw new ApiError(503, "The runtime internal URL must use loopback HTTP.");
  const raw = JSON.stringify(input);
  const stamp = Date.now();
  const nonce = randomUUID();
  const signature = createHmac("sha256", secret)
    .update(`${stamp}.${nonce}.${raw}`)
    .digest("hex");
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Runly-Timestamp": String(stamp),
        "X-Runly-Nonce": nonce,
        "X-Runly-Signature": signature,
      },
      body: raw,
      signal: AbortSignal.timeout(255_000),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, "The workspace gateway is not responding.");
  }
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      409,
      result.message || "Workspace files changed. Retry after refreshing.",
    );
}
