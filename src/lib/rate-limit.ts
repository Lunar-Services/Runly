import { isIP } from "node:net";

function clientAddress(request: Request) {
  for (const name of ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"]) {
    const value = request.headers.get(name)?.split(",", 1)[0]?.trim();
    if (value && isIP(value)) return value.toLowerCase();
  }
  return "";
}

export function rateLimitSubject(request: Request, subject = "") {
  const explicit = subject.trim().toLowerCase();
  if (explicit) return explicit.slice(0, 512);
  const address = clientAddress(request);
  return address ? `ip:${address}` : "anonymous";
}
