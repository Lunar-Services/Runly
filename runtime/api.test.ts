import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, readRawBody } from "../src/lib/api";

test("request bodies stop at the configured byte limit", async () => {
  const large = new Request("http://localhost", {
    method: "POST",
    body: "123456",
  });
  await assert.rejects(
    readRawBody(large, 3),
    (error: unknown) => error instanceof ApiError && error.status === 413,
  );
  const exact = new Request("http://localhost", {
    method: "POST",
    body: "123",
  });
  assert.equal((await readRawBody(exact, 3)).toString(), "123");
});
