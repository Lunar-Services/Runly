import test from "node:test";
import assert from "node:assert/strict";
import { rateLimitSubject } from "../src/lib/rate-limit";

test("anonymous rate limits are isolated by a validated client address", () => {
  const first = new Request("https://runly.example/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
  });
  const second = new Request("https://runly.example/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.11, 10.0.0.1" },
  });

  assert.equal(rateLimitSubject(first), "ip:203.0.113.10");
  assert.equal(rateLimitSubject(second), "ip:203.0.113.11");
  assert.notEqual(rateLimitSubject(first), rateLimitSubject(second));
});

test("explicit account subjects take precedence and are normalized", () => {
  const request = new Request("https://runly.example/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  });

  assert.equal(
    rateLimitSubject(request, " email:Person@Example.COM "),
    "email:person@example.com",
  );
});

test("untrusted address syntax does not create arbitrary buckets", () => {
  const request = new Request("https://runly.example/api/auth/github", {
    headers: { "x-forwarded-for": "not-an-ip" },
  });

  assert.equal(rateLimitSubject(request), "anonymous");
});
