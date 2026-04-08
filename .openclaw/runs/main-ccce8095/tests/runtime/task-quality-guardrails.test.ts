import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskQualityPayload,
  createTaskQualityNormalizedError,
  validateTaskQualityPayload,
} from "../../src/server/services/task-quality-guardrails.ts";

test("task quality guard accepts valid payload", () => {
  const payload = buildTaskQualityPayload({
    objective: "Implement runtime preflight validation for task payloads before dispatch.",
    scope: "Limit changes to dispatch/execute entry points and guardrail service only.",
    verificationSteps: ["Run npm run typecheck and npm test, then confirm outputs."],
    rollbackPlan: ["Rollback the change and fallback to previous stable flow if regressions appear."],
    outputExpectation: ["Return only bounded summary output with at most 3 bullets."],
  });

  const result = validateTaskQualityPayload(payload);
  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
});

test("task quality guard rejects missing rollback and bounded output", () => {
  const payload = buildTaskQualityPayload({
    objective: "Do work.",
    scope: "Any scope.",
    verificationSteps: ["Looks fine."],
    rollbackPlan: [],
    outputExpectation: ["Return details."],
  });

  const result = validateTaskQualityPayload(payload);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.field === "rollbackPlan"));
  assert.ok(result.issues.some((issue) => issue.field === "outputExpectation"));

  const normalized = createTaskQualityNormalizedError({
    source: "agents.dispatch",
    issues: result.issues,
  });

  assert.equal(normalized.code, "task_quality_validation_failed");
  assert.equal(normalized.source, "agents.dispatch");
  assert.equal(normalized.adapter, "task-quality-guardrails");
  assert.equal(normalized.retryable, false);
});
