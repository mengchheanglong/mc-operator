import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyDesloppifyFailure,
  evaluateLengthGate,
  extractJsonPayload,
  normalizeDesloppifyFailureClass,
} from "../../src/server/services/run-scoped-desloppify-core.ts";

test("evaluateLengthGate marks trigger when content is below threshold", () => {
  const below = evaluateLengthGate({ minChars: 100, content: "short" });
  assert.equal(below.minChars, 100);
  assert.equal(below.actualChars, 5);
  assert.equal(below.triggered, true);

  const above = evaluateLengthGate({ minChars: 5, content: "123456" });
  assert.equal(above.triggered, false);
});

test("extractJsonPayload parses clean and prefixed JSON output", () => {
  const clean = extractJsonPayload('{"ok":true,"count":3}') as { ok: boolean; count: number };
  assert.equal(clean.ok, true);
  assert.equal(clean.count, 3);

  const prefixed = extractJsonPayload("note: generated\n{\"status\":\"ok\"}") as { status: string };
  assert.equal(prefixed.status, "ok");

  const trailing = extractJsonPayload("{\"items\":[1,2,3]}\n-> query updated") as { items: number[] };
  assert.equal(trailing.items.length, 3);
});

test("classifyDesloppifyFailure maps timeout/tool-missing/non-zero cases", () => {
  assert.equal(classifyDesloppifyFailure({ timedOut: true, exitCode: 1 }), "timeout");
  assert.equal(classifyDesloppifyFailure({ timedOut: false, exitCode: 1, stderr: "No module named desloppify" }), "tool_missing");
  assert.equal(classifyDesloppifyFailure({ timedOut: false, exitCode: 2, stderr: "failed" }), "execution_failed");
});

test("normalizeDesloppifyFailureClass maps structured error messages", () => {
  assert.equal(normalizeDesloppifyFailureClass(new Error("invalid_input: no run")), "invalid_input");
  assert.equal(normalizeDesloppifyFailureClass(new Error("request timeout after 90s")), "timeout");
  assert.equal(normalizeDesloppifyFailureClass(new Error("parse_failed: invalid json")), "parse_failed");
  assert.equal(normalizeDesloppifyFailureClass(new Error("ModuleNotFoundError: No module named desloppify")), "tool_missing");
});
