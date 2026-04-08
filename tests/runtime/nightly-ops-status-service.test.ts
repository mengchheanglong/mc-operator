import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  evaluateNightlyOpsStepHotspotsHealth,
  evaluateNightlyOpsTrendHealth,
  readNightlyOpsBundleLatest,
  readNightlyOpsStepHotspots,
  readNightlyOpsStepHotspotReportLatest,
  readNightlyOpsStepHotspotAlertsLatest,
  readNightlyOpsStepHotspotFollowUpLatest,
  readNightlyOpsStepHotspotSummaryLatest,
  readNightlyOpsStepHotspotTrend,
  readNightlyOpsBundleTrend,
  readNightlyOpsSummaryLatest,
  readNightlyOpsSnapshot,
} from "../../src/server/services/nightly-ops-status-service.ts";

function makeProjectRoot() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nightly-ops-status-test-"));
  fs.mkdirSync(path.join(projectRoot, "reports", "ops"), { recursive: true });
  return {
    projectRoot,
    cleanup: () => fs.rmSync(projectRoot, { recursive: true, force: true }),
  };
}

test("readNightlyOpsSnapshot returns missing status when reports do not exist", () => {
  const temp = makeProjectRoot();
  try {
    const snapshot = readNightlyOpsSnapshot(temp.projectRoot, { maxAgeHours: 30 });
    assert.equal(snapshot.items.bundle.available, false);
    assert.equal(snapshot.items.opsHealthSnapshot.available, false);
    assert.equal(snapshot.items.canary.available, false);
    assert.equal(snapshot.overallOk, null);
  } finally {
    temp.cleanup();
  }
});

test("readNightlyOpsSnapshot aggregates healthy reports", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    const generatedAt = new Date().toISOString();
    const write = (file: string, payload: unknown) => {
      fs.writeFileSync(path.join(reportsDir, file), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    };

    write("nightly-ops-bundle-latest.json", {
      generatedAt,
      ok: true,
      failedCount: 0,
      durationMs: 12000,
      steps: [
        { id: "repo_sources_nightly", ok: true },
        { id: "workspace_health_nightly", ok: true },
        { id: "ops_health_snapshot", ok: true, exitCode: 0, durationMs: 300 },
      ],
    });
    write("repo-sources-nightly-latest.json", {
      generatedAt,
      ok: true,
      blockedCount: 0,
      failureSignature: "healthy",
    });
    write("workspace-global-health-latest.json", {
      generatedAt,
      ok: true,
      summary: {
        projects: { healthy: 4, total: 4 },
        runtimeChecks: { passed: 4, total: 4 },
      },
    });
    write("canary-latest.json", {
      generatedAt,
      ok: true,
      failedCriticalCount: 0,
    });
    write("orchestrator-nightly-latest.json", {
      generatedAt,
      ok: true,
      steps: [{ ok: true }, { ok: true }],
    });

    const snapshot = readNightlyOpsSnapshot(temp.projectRoot, { maxAgeHours: 30 });
    assert.equal(snapshot.items.bundle.available, true);
    assert.equal(snapshot.items.bundle.stale, false);
    assert.equal(snapshot.items.bundle.ok, true);
    assert.equal(snapshot.items.opsHealthSnapshot.available, true);
    assert.equal(snapshot.items.opsHealthSnapshot.ok, true);
    assert.equal(snapshot.items.repoSources.detail.includes("blocked=0"), true);
    assert.equal(snapshot.items.workspaceHealth.detail.includes("projects=4/4"), true);
    assert.equal(snapshot.overallOk, true);
  } finally {
    temp.cleanup();
  }
});

test("readNightlyOpsSnapshot marks opsHealthSnapshot missing when bundle lacks the step", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    const generatedAt = new Date().toISOString();
    const write = (file: string, payload: unknown) => {
      fs.writeFileSync(path.join(reportsDir, file), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    };

    write("nightly-ops-bundle-latest.json", {
      generatedAt,
      ok: true,
      failedCount: 0,
      durationMs: 5000,
      stepOrderVersion: 2,
      steps: [
        { id: "repo_sources_nightly", ok: true, exitCode: 0, durationMs: 200 },
        { id: "canary_nightly", ok: true, exitCode: 0, durationMs: 200 },
      ],
      stepTimeline: [
        { id: "repo_sources_nightly", ok: true, exitCode: 0, durationMs: 200, startedOffsetMs: 0, finishedOffsetMs: 200 },
        { id: "canary_nightly", ok: true, exitCode: 0, durationMs: 200, startedOffsetMs: 200, finishedOffsetMs: 400 },
      ],
    });
    write("repo-sources-nightly-latest.json", {
      generatedAt,
      ok: true,
      blockedCount: 0,
      failureSignature: "healthy",
    });
    write("workspace-global-health-latest.json", {
      generatedAt,
      ok: true,
      summary: { projects: { healthy: 1, total: 1 }, runtimeChecks: { passed: 1, total: 1 } },
    });
    write("canary-latest.json", {
      generatedAt,
      ok: true,
      failedCriticalCount: 0,
    });
    write("orchestrator-nightly-latest.json", {
      generatedAt,
      ok: true,
      steps: [{ ok: true }],
    });

    const snapshot = readNightlyOpsSnapshot(temp.projectRoot, { maxAgeHours: 30 });
    assert.equal(snapshot.items.bundle.ok, true);
    assert.equal(snapshot.items.opsHealthSnapshot.available, false);
    assert.equal(snapshot.items.opsHealthSnapshot.detail, "step missing in bundle");
    assert.equal(snapshot.overallOk, false);

    const bundle = readNightlyOpsBundleLatest(temp.projectRoot);
    assert.equal(bundle.available, true);
    assert.equal(bundle.stepOrderVersion, 2);
    assert.equal(bundle.steps.length, 2);
    assert.equal(bundle.stepTimeline.length, 2);
  } finally {
    temp.cleanup();
  }
});

test("readNightlyOpsBundleTrend returns newest timestamped bundle reports first", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    const write = (file: string, payload: unknown) => {
      fs.writeFileSync(path.join(reportsDir, file), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    };

    write("nightly-ops-bundle-2026-03-17T10-00-00-000Z.json", {
      generatedAt: "2026-03-17T10:00:00.000Z",
      ok: true,
      failedCount: 0,
      durationMs: 1000,
      stepOrderVersion: 2,
    });
    write("nightly-ops-bundle-2026-03-17T11-00-00-000Z.json", {
      generatedAt: "2026-03-17T11:00:00.000Z",
      ok: false,
      failedCount: 1,
      durationMs: 2000,
      stepOrderVersion: 2,
    });
    write("nightly-ops-bundle-latest.json", {
      generatedAt: "2026-03-17T11:00:00.000Z",
      ok: false,
      failedCount: 1,
      durationMs: 2000,
      stepOrderVersion: 2,
      steps: [],
      stepTimeline: [],
    });

    const trend = readNightlyOpsBundleTrend(temp.projectRoot, { limit: 2 });
    assert.equal(trend.length, 2);
    assert.equal(trend[0]?.generatedAt, "2026-03-17T11:00:00.000Z");
    assert.equal(trend[0]?.ok, false);
    assert.equal(trend[1]?.generatedAt, "2026-03-17T10:00:00.000Z");
    assert.equal(trend[1]?.ok, true);
  } finally {
    temp.cleanup();
  }
});

test("readNightlyOpsSummaryLatest parses summary markdown metadata", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    fs.writeFileSync(
      path.join(reportsDir, "nightly-ops-summary-latest.md"),
      `# Nightly Ops Summary

- Generated At: 2026-03-17T20:00:00.000Z
- Bundle Generated At: 2026-03-17T19:50:00.000Z
- Overall: PASS
- Failed Count: 0
- Duration (ms): 345678
- Step Order Version: 2
`,
      "utf8",
    );

    const summary = readNightlyOpsSummaryLatest(temp.projectRoot);
    assert.equal(summary.available, true);
    assert.equal(summary.overall, "PASS");
    assert.equal(summary.failedCount, 0);
    assert.equal(summary.durationMs, 345678);
    assert.equal(summary.stepOrderVersion, 2);
    assert.equal(summary.generatedAt, "2026-03-17T20:00:00.000Z");
    assert.equal(summary.bundleGeneratedAt, "2026-03-17T19:50:00.000Z");
  } finally {
    temp.cleanup();
  }
});

test("evaluateNightlyOpsTrendHealth flags failing ratio and spike", () => {
  const points = [
    { generatedAt: "2026-03-17T20:00:00.000Z", ok: false, failedCount: 1, durationMs: 1000, stepOrderVersion: 2, reportFile: "a" },
    { generatedAt: "2026-03-17T19:00:00.000Z", ok: false, failedCount: 1, durationMs: 100, stepOrderVersion: 2, reportFile: "b" },
    { generatedAt: "2026-03-17T18:00:00.000Z", ok: true, failedCount: 0, durationMs: 100, stepOrderVersion: 2, reportFile: "c" },
    { generatedAt: "2026-03-17T17:00:00.000Z", ok: true, failedCount: 0, durationMs: 100, stepOrderVersion: 2, reportFile: "d" },
  ];
  const health = evaluateNightlyOpsTrendHealth(points, {
    maxFailingRatio: 0.25,
    maxDurationSpikeRatio: 2,
    minRecoveryStreak: 3,
  });
  assert.equal(health.ok, false);
  assert.equal(health.status, "warning");
  assert.equal(health.reasons.includes("failing_ratio_exceeded"), true);
  assert.equal(health.reasons.includes("duration_spike_exceeded"), true);
});

test("evaluateNightlyOpsTrendHealth suppresses historical failing ratio when healthy recovery streak is met", () => {
  const points = [
    { generatedAt: "2026-03-17T20:00:00.000Z", ok: true, failedCount: 0, durationMs: 100, stepOrderVersion: 2, reportFile: "a" },
    { generatedAt: "2026-03-17T19:00:00.000Z", ok: true, failedCount: 0, durationMs: 95, stepOrderVersion: 2, reportFile: "b" },
    { generatedAt: "2026-03-17T18:00:00.000Z", ok: true, failedCount: 0, durationMs: 90, stepOrderVersion: 2, reportFile: "c" },
    { generatedAt: "2026-03-17T17:00:00.000Z", ok: false, failedCount: 1, durationMs: 100, stepOrderVersion: 2, reportFile: "d" },
    { generatedAt: "2026-03-17T16:00:00.000Z", ok: false, failedCount: 1, durationMs: 100, stepOrderVersion: 2, reportFile: "e" },
  ];
  const health = evaluateNightlyOpsTrendHealth(points, {
    maxFailingRatio: 0.2,
    maxDurationSpikeRatio: 3,
    minRecoveryStreak: 3,
  });
  assert.equal(health.failingRatio > 0.2, true);
  assert.equal(health.ok, true);
  assert.equal(health.status, "healthy");
  assert.equal(health.reasons.length, 0);
});

test("readNightlyOpsStepHotspots marks risky nightly steps", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    const write = (file: string, payload: unknown) => {
      fs.writeFileSync(path.join(reportsDir, file), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    };

    write("nightly-ops-bundle-2026-03-17T11-00-00-000Z.json", {
      generatedAt: "2026-03-17T11:00:00.000Z",
      ok: false,
      failedCount: 1,
      durationMs: 300000,
      stepOrderVersion: 2,
      steps: [
        { id: "repo_sources_nightly", ok: false, exitCode: 1, durationMs: 240000, command: "a" },
        { id: "canary_nightly", ok: true, exitCode: 0, durationMs: 30000, command: "b" },
      ],
      stepTimeline: [],
    });
    write("nightly-ops-bundle-2026-03-17T10-00-00-000Z.json", {
      generatedAt: "2026-03-17T10:00:00.000Z",
      ok: true,
      failedCount: 0,
      durationMs: 90000,
      stepOrderVersion: 2,
      steps: [
        { id: "repo_sources_nightly", ok: true, exitCode: 0, durationMs: 60000, command: "a" },
        { id: "canary_nightly", ok: true, exitCode: 0, durationMs: 30000, command: "b" },
      ],
      stepTimeline: [],
    });

    const hotspots = readNightlyOpsStepHotspots(temp.projectRoot, {
      limit: 8,
      minSamplesPerStep: 2,
      maxFailureRate: 0.2,
      slowDurationMs: 120000,
      maxSlowRuns: 3,
      maxDurationSpikeRatio: 1.5,
      minFailingStreak: 1,
      minSlowStreak: 1,
    });
    const repo = hotspots.find((item) => item.stepId === "repo_sources_nightly");
    assert.ok(repo);
    assert.equal(repo.flagged, true);
    assert.equal(["low", "medium", "high"].includes(repo.severity), true);
    assert.equal(repo.reasons.includes("failure_rate_exceeded"), true);
    assert.equal(repo.reasons.includes("duration_spike_exceeded"), true);
  } finally {
    temp.cleanup();
  }
});

test("evaluateNightlyOpsStepHotspotsHealth respects flagged step threshold", () => {
  const hotspots = [
    {
      stepId: "repo_sources_nightly",
      severity: "medium",
      severityScore: 6,
      samples: 4,
      failureCount: 2,
      failureRate: 0.5,
      failingStreak: 1,
      slowCount: 1,
      slowStreak: 1,
      avgDurationMs: 1000,
      medianDurationMs: 800,
      latestDurationMs: 1200,
      durationSpikeRatio: 1.5,
      lastFailureAt: "2026-03-17T10:00:00.000Z",
      latestReportFile: "nightly-ops-bundle-2026-03-17T11-00-00-000Z.json",
      reasons: ["failure_rate_exceeded"],
      flagged: true,
    },
  ];
  const strict = evaluateNightlyOpsStepHotspotsHealth(hotspots, { maxFlaggedSteps: 0 });
  assert.equal(strict.ok, false);
  assert.equal(strict.status, "warning");
  assert.equal(strict.reasons.includes("flagged_steps_exceeded"), true);

  const relaxed = evaluateNightlyOpsStepHotspotsHealth(hotspots, { maxFlaggedSteps: 1 });
  assert.equal(relaxed.ok, true);
  assert.equal(relaxed.status, "healthy");
});

test("readNightlyOpsStepHotspotReportLatest parses latest hotspot report status", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    fs.writeFileSync(
      path.join(reportsDir, "nightly-step-hotspots-latest.json"),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        ok: true,
        health: {
          status: "healthy",
          ok: true,
          reasons: [],
          totalSteps: 5,
          flaggedCount: 0,
          thresholds: { maxFlaggedSteps: 0 },
        },
        hotspots: [],
      }, null, 2)}\n`,
      "utf8",
    );

    const snapshot = readNightlyOpsStepHotspotReportLatest(temp.projectRoot, { maxAgeHours: 30 });
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.stale, false);
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.totalSteps, 5);
    assert.equal(snapshot.flaggedCount, 0);
  } finally {
    temp.cleanup();
  }
});

test("readNightlyOpsStepHotspotTrend returns newest hotspot report points first", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    const write = (file: string, payload: unknown) => {
      fs.writeFileSync(path.join(reportsDir, file), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    };

    write("nightly-step-hotspots-2026-03-17T10-00-00-000Z.json", {
      generatedAt: "2026-03-17T10:00:00.000Z",
      ok: true,
      health: { flaggedCount: 0, totalSteps: 5 },
    });
    write("nightly-step-hotspots-2026-03-17T11-00-00-000Z.json", {
      generatedAt: "2026-03-17T11:00:00.000Z",
      ok: false,
      health: { flaggedCount: 2, totalSteps: 5 },
    });

    const trend = readNightlyOpsStepHotspotTrend(temp.projectRoot, { limit: 2 });
    assert.equal(trend.length, 2);
    assert.equal(trend[0]?.generatedAt, "2026-03-17T11:00:00.000Z");
    assert.equal(trend[0]?.flaggedCount, 2);
    assert.equal(trend[0]?.ok, false);
    assert.equal(trend[1]?.generatedAt, "2026-03-17T10:00:00.000Z");
    assert.equal(trend[1]?.flaggedCount, 0);
    assert.equal(trend[1]?.ok, true);
  } finally {
    temp.cleanup();
  }
});

test("readNightlyOpsStepHotspotAlertsLatest parses latest alert feed", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    fs.writeFileSync(
      path.join(reportsDir, "nightly-step-hotspots-alerts-latest.json"),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        ok: true,
        alertCount: 1,
        bySeverity: { high: 0, medium: 1, low: 0 },
        alerts: [
          {
            stepId: "workspace_health_nightly",
            severity: "medium",
            reasons: ["slow_runs_exceeded"],
            failureRate: 0.1,
            failingStreak: 0,
            slowStreak: 2,
            latestDurationMs: 180123,
            lastFailureAt: null,
          },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    const snapshot = readNightlyOpsStepHotspotAlertsLatest(temp.projectRoot, { maxAgeHours: 30 });
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.alertCount, 1);
    assert.equal(snapshot.bySeverity.medium, 1);
    assert.equal(snapshot.alerts[0]?.stepId, "workspace_health_nightly");
  } finally {
    temp.cleanup();
  }
});

test("readNightlyOpsStepHotspotSummaryLatest parses hotspot summary markdown", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    fs.writeFileSync(
      path.join(reportsDir, "nightly-step-hotspots-summary-latest.md"),
      `# Nightly Step Hotspots Summary

- Generated At: 2026-03-17T20:30:00.000Z
- Hotspot Report Generated At: 2026-03-17T20:29:00.000Z
- Overall: PASS
- Flagged Count: 0
- Total Steps: 5
- Worst Step: repo_sources_nightly
`,
      "utf8",
    );

    const snapshot = readNightlyOpsStepHotspotSummaryLatest(temp.projectRoot);
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.overall, "PASS");
    assert.equal(snapshot.flaggedCount, 0);
    assert.equal(snapshot.totalSteps, 5);
    assert.equal(snapshot.worstStep, "repo_sources_nightly");
    assert.equal(snapshot.generatedAt, "2026-03-17T20:30:00.000Z");
  } finally {
    temp.cleanup();
  }
});

test("readNightlyOpsStepHotspotFollowUpLatest parses latest follow-up artifact", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    fs.writeFileSync(
      path.join(reportsDir, "nightly-step-hotspots-followup-latest.json"),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        ok: false,
        minSeverity: "high",
        bySeverity: { high: 2, medium: 1, low: 0 },
        questAction: {
          action: "created",
          questId: "quest-123",
          dedupeKey: "nightly-hotspot:abc123",
          failureClass: "high:repo_sources_nightly:failure_rate_exceeded",
          cooldown: {
            onCooldown: false,
            minutesRemaining: 0,
            lastAlertAt: null,
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const snapshot = readNightlyOpsStepHotspotFollowUpLatest(temp.projectRoot, { maxAgeHours: 30 });
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.stale, false);
    assert.equal(snapshot.ok, false);
    assert.equal(snapshot.minSeverity, "high");
    assert.equal(snapshot.highCount, 2);
    assert.equal(snapshot.mediumCount, 1);
    assert.equal(snapshot.lowCount, 0);
    assert.equal(snapshot.questAction?.action, "created");
    assert.equal(snapshot.questAction?.questId, "quest-123");
  } finally {
    temp.cleanup();
  }
});
