import test from "node:test";
import assert from "node:assert/strict";
import { buildTelegramChunkPlan } from "../../src/server/services/telegram-send-guard.ts";

test("under limit stays single chunk", () => {
  const text = "hello world";
  const plan = buildTelegramChunkPlan(text, { limit: 50 });
  assert.equal(plan.chunks.length, 1);
  assert.equal(plan.chunks[0], text);
  assert.equal(plan.summarized, false);
});

test("exactly at limit stays single chunk", () => {
  const text = "a".repeat(32);
  const plan = buildTelegramChunkPlan(text, { limit: 32 });
  assert.equal(plan.chunks.length, 1);
  assert.equal(plan.chunks[0].length, 32);
  assert.equal(plan.summarized, false);
});

test("over limit chunks safely", () => {
  const text = [
    "Paragraph one sentence one. Paragraph one sentence two.",
    "Paragraph two sentence one. Paragraph two sentence two.",
    "Paragraph three sentence one. Paragraph three sentence two.",
  ].join("\n\n");

  const plan = buildTelegramChunkPlan(text, { limit: 80, maxChunks: 10 });
  assert.ok(plan.chunks.length >= 2);
  assert.equal(plan.summarized, false);
  for (const chunk of plan.chunks) {
    assert.ok(chunk.length <= 80);
  }
});

test("multi chunk ordering is preserved", () => {
  const text = Array.from({ length: 30 }, (_, i) => `Sentence ${i + 1}.`).join(" ");
  const plan = buildTelegramChunkPlan(text, { limit: 64, maxChunks: 10 });
  assert.ok(plan.chunks.length > 1);
  const rebuilt = plan.chunks.join(" ").replace(/\s+/g, " ");
  assert.ok(rebuilt.includes("Sentence 1."));
  assert.ok(rebuilt.includes("Sentence 30."));
  assert.equal(plan.summarized, false);
});
