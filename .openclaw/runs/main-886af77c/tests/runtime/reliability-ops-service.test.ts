import test from "node:test";
import assert from "node:assert/strict";
import {
  computeFailureWindowKey,
  decideRouteModel,
  evaluateReliability,
  type ReliabilitySample,
} from "../../src/server/services/reliability-ops-core.ts";

test("evaluateReliability flags insufficient_data below min samples", () => {
  const samples: ReliabilitySample[] = [
    { id: "r1", totalDurationMs: 1000, failureClass: null, fallbackUsed: false },
    { id: "r2", totalDurationMs: 1200, failureClass: null, fallbackUsed: false },
  ];

  const summary = evaluateReliability(samples, {
    minSamples: 20,
    maxTimeoutRate: 0.2,
    maxFailoverRate: 0.5,
    maxToolErrorRate: 0.1,
    maxAvgDurationMs: 120000,
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.reason, "insufficient_data");
  assert.equal(summary.status, "insufficient_data");
});

test("failure window key is stable for the same summary (idempotency basis)", () => {
  const failingSummary = evaluateReliability(
    Array.from({ length: 20 }, (_, i) => ({
      id: `fail-${i}`,
      timestamp: new Date().toISOString(),
      totalDurationMs: 1000,
      failureClass: i < 5 ? "timeout" : null,
      fallbackUsed: false,
    })),
    {
      minSamples: 20,
      maxTimeoutRate: 0.2,
      maxFailoverRate: 0.5,
      maxToolErrorRate: 0.1,
      maxAvgDurationMs: 120000,
    },
  );

  const key1 = computeFailureWindowKey(failingSummary);
  const key2 = computeFailureWindowKey(failingSummary);
  assert.equal(key1, key2);
});

test("decideRouteModel promotes fallback when degradation threshold is exceeded", () => {
  const degradedSummary = evaluateReliability(
    Array.from({ length: 20 }, (_, i) => ({
      id: `s-${i}`,
      totalDurationMs: 5000,
      failureClass: i < 4 ? "timeout" : i === 4 ? "tool_error" : null,
      fallbackUsed: false,
    })),
    {
      minSamples: 20,
      maxTimeoutRate: 0.2,
      maxFailoverRate: 0.5,
      maxToolErrorRate: 0.1,
      maxAvgDurationMs: 120000,
    },
  );

  const decision = decideRouteModel({
    summary: degradedSummary,
    enabled: true,
    minSample: 20,
    degradationThreshold: 0.2,
    primaryModel: "primary-model",
    fallbackModel: "fallback-model",
  });

  assert.equal(decision.promoteFallback, true);
  assert.equal(decision.selectedModel, "fallback-model");
  assert.equal(decision.reason, "degradation_threshold_exceeded");
});
