import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeMessage,
  decodeMessage,
  mediaPath,
  combinedUsage,
} from "../src/lib/chat-media";
const ref = {
  id: "f7350506-e2a7-417a-9f4e-1d5987ace727",
  owner: "12345678-1234-4123-8123-123456789012",
};
test("media messages round trip while legacy messages stay readable", () => {
  assert.deepEqual(decodeMessage(encodeMessage("Look at this", [ref])), {
    text: "Look at this",
    media: [ref],
  });
  assert.deepEqual(decodeMessage("Normal chat"), {
    text: "Normal chat",
    media: [],
  });
});
test("forged paths and excessive attachments are rejected", () => {
  assert.throws(() => mediaPath("../../secret", ref));
  assert.throws(() => mediaPath(ref.id, { ...ref, owner: "../other" }));
  assert.throws(() => encodeMessage("test", Array(5).fill(ref)));
  assert.throws(() => encodeMessage("x".repeat(12000), [ref]));
});
test("malformed envelopes render as text instead of trusted attachments", () => {
  const body =
    'runly-media:v1\n{"text":"hello","media":[{"id":"evil","owner":"bad"}]}';
  assert.deepEqual(decodeMessage(body), { text: body, media: [] });
});
test("transcription tokens are added to agent usage exactly once", () => {
  assert.deepEqual(
    combinedUsage(
      { input_tokens: 10, output_tokens: 3 },
      { media_input_tokens: 4, media_output_tokens: 2 },
    ),
    {
      input_tokens: 14,
      output_tokens: 5,
      media_input_tokens: 4,
      media_output_tokens: 2,
    },
  );
});
