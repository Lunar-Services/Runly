import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export type RuntimeTicket = {
  project: string;
  user: string;
  gateway: string;
  exp: number;
};
export function signTicket(value: RuntimeTicket, secret: string) {
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}
export function verifyTicket(token: string, secret: string): RuntimeTicket {
  const [data, signature, extra] = token.split(".");
  if (!data || !signature || extra)
    throw new Error("Invalid connection ticket");
  const expected = createHmac("sha256", secret).update(data).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    throw new Error("Invalid connection ticket");
  const value = JSON.parse(
    Buffer.from(data, "base64url").toString(),
  ) as RuntimeTicket;
  if (
    !value.project ||
    !value.user ||
    !value.gateway ||
    !Number.isFinite(value.exp) ||
    value.exp < Date.now()
  )
    throw new Error("Connection ticket expired");
  return value;
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function validWorkspacePath(value: string) {
  const ignored = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".cache",
    "__pycache__",
    ".venv",
    ".runly",
    ".npmrc",
    ".pypirc",
    ".netrc",
    ".ssh",
    ".aws",
  ]);
  return (
    value.length > 0 &&
    value.length <= 1024 &&
    !/[\\\x00-\x1f:]/.test(value) &&
    value.split("/").every((part) => {
      const name = part.toLowerCase();
      return (
        part !== "" &&
        part !== "." &&
        part !== ".." &&
        !ignored.has(name) &&
        !name.startsWith(".env") &&
        !name.endsWith(".pem") &&
        !name.endsWith(".key") &&
        ![
          "id_rsa",
          "id_ed25519",
          "credentials.json",
          "service-account.json",
        ].includes(name)
      );
    })
  );
}
export function gateways(): { id: string; url: string }[] {
  const entries = JSON.parse(process.env.RUNLY_RUNTIME_GATEWAYS || "[]") as {
    id: string;
    url: string;
  }[];
  if (
    !Array.isArray(entries) ||
    !entries.length ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length ||
    entries.some((entry) => {
      if (!entry.id || typeof entry.url !== "string") return true;
      try {
        const url = new URL(entry.url);
        const localMock =
          process.env.RUNLY_RUNTIME_MODE === "mock" &&
          process.env.NODE_ENV !== "production" &&
          url.protocol === "ws:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname);
        return (
          (!localMock && url.protocol !== "wss:") ||
          !!url.username ||
          !!url.password ||
          !!url.search ||
          !!url.hash
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error("Configure RUNLY_RUNTIME_GATEWAYS");
  return entries;
}
export function gatewayFor(project: string) {
  const entries = gateways();
  return entries[parseInt(digest(project).slice(0, 8), 16) % entries.length];
}
