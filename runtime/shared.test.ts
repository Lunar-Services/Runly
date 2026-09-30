import test from "node:test";
import assert from "node:assert/strict";
import {
  signTicket,
  verifyTicket,
  validWorkspacePath,
  gateways,
  gatewayFor,
} from "../src/lib/runtime/shared";

test("connection tickets bind project, user and gateway and expire", () => {
  const ticket = {
    project: "project-a",
    user: "user-a",
    gateway: "primary",
    exp: Date.now() + 60_000,
  };
  const secret = "a".repeat(32);
  assert.deepEqual(verifyTicket(signTicket(ticket, secret), secret), ticket);
  assert.throws(() => verifyTicket(signTicket(ticket, secret), "b".repeat(32)));
  assert.throws(() =>
    verifyTicket(signTicket({ ...ticket, exp: 0 }, secret), secret),
  );
  const encoded = signTicket(ticket, secret).split(".");
  encoded[0] = Buffer.from(
    JSON.stringify({ ...ticket, project: "victim" }),
  ).toString("base64url");
  assert.throws(() => verifyTicket(encoded.join("."), secret));
  assert.throws(() =>
    verifyTicket(`${signTicket(ticket, secret)}.extra`, secret),
  );
});

test("workspace paths cannot escape or restore excluded runtime files", () => {
  for (const path of ["README.md", "src/app/page.tsx", "my folder/file.txt"])
    assert.equal(validWorkspacePath(path), true, path);
  for (const path of [
    "../secret",
    "/etc/passwd",
    "a/../../b",
    "a//b",
    "a/./b",
    "a\\b",
    "C:/secret",
    "x\0y",
    "node_modules/x",
    ".runly/bridge.py",
    "a/.git/config",
    ".env",
    ".env.local",
    "src/.env.production",
    "config/.npmrc",
    "secrets/private.pem",
    "credentials.json",
  ])
    assert.equal(validWorkspacePath(path), false, path);
});

test("gateway sharding is stable and duplicate gateway identities are rejected", () => {
  const previous = process.env.RUNLY_RUNTIME_GATEWAYS;
  try {
    process.env.RUNLY_RUNTIME_GATEWAYS = JSON.stringify([
      { id: "a", url: "wss://a.example.com" },
      { id: "b", url: "wss://b.example.com" },
    ]);
    assert.equal(gatewayFor("same-project").id, gatewayFor("same-project").id);
    assert.equal(gateways().length, 2);
    process.env.RUNLY_RUNTIME_GATEWAYS =
      '[{"id":"a","url":"wss://a.example.com"},{"id":"a","url":"wss://b.example.com"}]';
    assert.throws(gateways);
    process.env.RUNLY_RUNTIME_GATEWAYS = "{}";
    assert.throws(gateways);
    process.env.RUNLY_RUNTIME_GATEWAYS =
      '[{"id":"a","url":"ws://public.example.com"}]';
    assert.throws(gateways, "public runtime connections must use WSS");
    process.env.RUNLY_RUNTIME_GATEWAYS =
      '[{"id":"a","url":"wss://user:password@public.example.com"}]';
    assert.throws(gateways, "gateway URLs cannot carry credentials");
  } finally {
    if (previous === undefined) delete process.env.RUNLY_RUNTIME_GATEWAYS;
    else process.env.RUNLY_RUNTIME_GATEWAYS = previous;
  }
});
