import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isOpsHealthSnapshotLastStep } from "../src/server/services/nightly-ops-bundle-core.ts";

type NightlyStep = {
  id: string;
  command: string;
  ok: boolean;
  exitCode: number;
};

type NightlyTimelineStep = {
  id: string;
  ok: boolean;
  exitCode: number;
  durationMs: number;
  startedOffsetMs: number;
  finishedOffsetMs: number;
};

type NightlyBundleLatest = {
  generatedAt: string;
  ok: boolean;
  failedCount: number;
  stepOrderVersion?: number;
  steps: NightlyStep[];
  stepTimeline?: NightlyTimelineStep[];
};

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const reportPath = path.join(process.cwd(), "reports", "ops", "nightly-ops-bundle-latest.json");
  if (!existsSync(reportPath)) {
    process.stderr.write(`Missing nightly bundle report: ${reportPath}\n`);
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8")) as NightlyBundleLatest;
  const maxAgeHours = Math.max(1, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_MAX_AGE_HOURS", 30)));
  const generatedAtMs = Date.parse(report.generatedAt);
  const ageMs = Date.now() - generatedAtMs;
  const stale = !Number.isFinite(generatedAtMs) || ageMs > maxAgeHours * 60 * 60 * 1000;

  const requiredSteps = new Set([
    "repo_sources_nightly",
    "workspace_health_nightly",
    "canary_nightly",
    "orchestrator_nightly",
    "ops_health_snapshot",
  ]);

  const actualSteps = Array.isArray(report.steps) ? report.steps : [];
  const stepIds = new Set(actualSteps.map((step) => step.id));
  const missingSteps = Array.from(requiredSteps).filter((id) => !stepIds.has(id));
  const failedSteps = actualSteps.filter((step) => !step.ok).map((step) => step.id);
  const timeline = Array.isArray(report.stepTimeline) ? report.stepTimeline : [];
  const timelineOk = timeline.length === actualSteps.length;
  const snapshotLast = isOpsHealthSnapshotLastStep(actualSteps);
  const stepOrderVersion = Number(report.stepOrderVersion ?? 0);
  const orderVersionOk = stepOrderVersion >= 2;

  const ok = !stale
    && report.ok === true
    && Number(report.failedCount || 0) === 0
    && missingSteps.length === 0
    && failedSteps.length === 0
    && snapshotLast
    && timelineOk
    && orderVersionOk;

  const output = {
    ok,
    reportPath,
    generatedAt: report.generatedAt,
    stale,
    maxAgeHours,
    failedCount: Number(report.failedCount || 0),
    stepOrderVersion,
    orderVersionOk,
    snapshotLast,
    timelineOk,
    timelineCount: timeline.length,
    missingSteps,
    failedSteps,
    steps: actualSteps.map((step) => ({
      id: step.id,
      command: step.command,
      ok: step.ok,
      exitCode: step.exitCode,
    })),
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
