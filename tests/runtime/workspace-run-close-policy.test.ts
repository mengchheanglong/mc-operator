import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyWorktreeRemoveFailure,
  computeCleanupRetryDelayMs,
} from "../../src/server/services/workspace-run-close-policy.ts";

test("classifyWorktreeRemoveFailure detects missing worktree as non-fatal", () => {
  const kind = classifyWorktreeRemoveFailure(
    new Error('fatal: "C:/repo/.openclaw/runs/main-abc" is not a working tree'),
  );
  assert.equal(kind, "missing");
});

test("classifyWorktreeRemoveFailure detects lock contention as retryable", () => {
  const kind = classifyWorktreeRemoveFailure(
    new Error("Permission denied: resource busy, directory in use by another process"),
  );
  assert.equal(kind, "locked");
});

test("classifyWorktreeRemoveFailure detects explicit permission failures", () => {
  const kind = classifyWorktreeRemoveFailure(
    new Error("fatal: Access is denied"),
  );
  assert.equal(kind, "permission");
});

test("computeCleanupRetryDelayMs increases and caps at 30 minutes", () => {
  assert.equal(computeCleanupRetryDelayMs(1), 60_000);
  assert.equal(computeCleanupRetryDelayMs(2), 120_000);
  assert.equal(computeCleanupRetryDelayMs(3), 240_000);
  assert.equal(computeCleanupRetryDelayMs(10), 1_800_000);
});
