import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNightlyOpsBundlePayload,
  isOpsHealthSnapshotLastStep,
  type NightlyOpsBundleStepResult,
} from "../../src/server/services/nightly-ops-bundle-core.ts";

function step(input: Partial<NightlyOpsBundleStepResult> & Pick<NightlyOpsBundleStepResult, "id">): NightlyOpsBundleStepResult {
  return {
    id: input.id,
    command: input.command || "npm run fake",
    ok: input.ok ?? true,
    exitCode: input.exitCode ?? 0,
    durationMs: input.durationMs ?? 0,
    stdout: input.stdout ?? "",
    stderr: input.stderr ?? "",
  };
}

test("isOpsHealthSnapshotLastStep returns true only when snapshot step is last", () => {
  assert.equal(
    isOpsHealthSnapshotLastStep([
      step({ id: "repo_sources_nightly" }),
      step({ id: "ops_health_snapshot" }),
    ]),
    true,
  );
  assert.equal(
    isOpsHealthSnapshotLastStep([
      step({ id: "ops_health_snapshot" }),
      step({ id: "workspace_health_nightly" }),
    ]),
    false,
  );
  assert.equal(
    isOpsHealthSnapshotLastStep([
      step({ id: "repo_sources_nightly" }),
      step({ id: "canary_nightly" }),
    ]),
    false,
  );
});

test("buildNightlyOpsBundlePayload produces ordered step timeline and failed count", () => {
  const startedAt = new Date(Date.now() - 50);
  const payload = buildNightlyOpsBundlePayload({
    startedAt,
    steps: [
      step({ id: "repo_sources_nightly", durationMs: 200 }),
      step({ id: "canary_nightly", durationMs: 300, ok: false, exitCode: 1 }),
      step({ id: "ops_health_snapshot", durationMs: 100 }),
    ],
  });

  assert.equal(payload.stepOrderVersion, 2);
  assert.equal(payload.steps.length, 3);
  assert.equal(payload.failedCount, 1);
  assert.equal(payload.ok, false);
  assert.equal(payload.stepTimeline.length, 3);
  assert.deepEqual(
    payload.stepTimeline.map((item) => item.id),
    ["repo_sources_nightly", "canary_nightly", "ops_health_snapshot"],
  );
  assert.deepEqual(
    payload.stepTimeline.map((item) => item.startedOffsetMs),
    [0, 200, 500],
  );
  assert.deepEqual(
    payload.stepTimeline.map((item) => item.finishedOffsetMs),
    [200, 500, 600],
  );
  assert.equal(payload.durationMs >= 0, true);
});
