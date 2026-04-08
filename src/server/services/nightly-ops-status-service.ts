import fs from "node:fs";
import path from "node:path";
import { getControlPlaneProjectId, getWorkspaceRootPath } from "@/server/projects/workspace-projects";

export interface NightlyOpsStatusItem {
  key: "bundle" | "opsHealthSnapshot" | "repoSources" | "workspaceHealth" | "canary" | "orchestrator";
  label: string;
  reportFile: string;
  available: boolean;
  ok: boolean | null;
  generatedAt: string | null;
  stale: boolean;
  ageMinutes: number | null;
  detail: string;
}

export interface NightlyOpsSnapshot {
  generatedAt: string;
  maxAgeHours: number;
  overallOk: boolean | null;
  items: {
    bundle: NightlyOpsStatusItem;
    opsHealthSnapshot: NightlyOpsStatusItem;
    repoSources: NightlyOpsStatusItem;
    workspaceHealth: NightlyOpsStatusItem;
    canary: NightlyOpsStatusItem;
    orchestrator: NightlyOpsStatusItem;
  };
}

export interface NightlyOpsBundleLatestStep {
  id: string;
  command: string;
  ok: boolean;
  exitCode: number;
  durationMs: number;
}

export interface NightlyOpsBundleTimelineStep {
  id: string;
  ok: boolean;
  exitCode: number;
  durationMs: number;
  startedOffsetMs: number;
  finishedOffsetMs: number;
}

export interface NightlyOpsBundleLatestSnapshot {
  reportFile: string;
  available: boolean;
  generatedAt: string | null;
  ok: boolean | null;
  failedCount: number | null;
  stepOrderVersion: number | null;
  steps: NightlyOpsBundleLatestStep[];
  stepTimeline: NightlyOpsBundleTimelineStep[];
}

export interface NightlyOpsBundleTrendPoint {
  generatedAt: string | null;
  ok: boolean | null;
  failedCount: number;
  durationMs: number;
  stepOrderVersion: number;
  reportFile: string;
}

export interface NightlyOpsSummaryLatestSnapshot {
  reportFile: string;
  available: boolean;
  generatedAt: string | null;
  bundleGeneratedAt: string | null;
  overall: "PASS" | "FAIL" | "UNKNOWN";
  failedCount: number | null;
  durationMs: number | null;
  stepOrderVersion: number | null;
}

export interface NightlyOpsTrendHealth {
  status: "healthy" | "warning" | "insufficient_data";
  ok: boolean;
  reasons: string[];
  total: number;
  failingCount: number;
  failingRatio: number;
  latestDurationMs: number | null;
  medianDurationMs: number | null;
  spikeRatio: number | null;
  thresholds: {
    maxFailingRatio: number;
    maxDurationSpikeRatio: number;
    minRecoveryStreak: number;
  };
}

export interface NightlyOpsStepHotspot {
  stepId: string;
  severity: "low" | "medium" | "high";
  severityScore: number;
  samples: number;
  failureCount: number;
  failureRate: number;
  failingStreak: number;
  slowCount: number;
  slowStreak: number;
  avgDurationMs: number;
  medianDurationMs: number | null;
  latestDurationMs: number | null;
  durationSpikeRatio: number | null;
  lastFailureAt: string | null;
  latestReportFile: string | null;
  reasons: string[];
  flagged: boolean;
}

export interface NightlyOpsStepHotspotHealth {
  status: "healthy" | "warning" | "insufficient_data";
  ok: boolean;
  reasons: string[];
  totalSteps: number;
  flaggedCount: number;
  thresholds: {
    maxFlaggedSteps: number;
  };
}

export interface NightlyOpsStepHotspotReportLatest {
  reportFile: string;
  available: boolean;
  generatedAt: string | null;
  ok: boolean | null;
  stale: boolean;
  ageMinutes: number | null;
  flaggedCount: number;
  totalSteps: number;
  maxFlaggedSteps: number | null;
  hotspots: NightlyOpsStepHotspot[];
}

export interface NightlyOpsStepHotspotTrendPoint {
  reportFile: string;
  generatedAt: string | null;
  ok: boolean | null;
  flaggedCount: number;
  totalSteps: number;
}

export interface NightlyOpsStepHotspotAlertsLatestSnapshot {
  reportFile: string;
  available: boolean;
  generatedAt: string | null;
  ok: boolean | null;
  stale: boolean;
  ageMinutes: number | null;
  alertCount: number;
  bySeverity: {
    high: number;
    medium: number;
    low: number;
  };
  alerts: Array<{
    stepId: string;
    severity: "low" | "medium" | "high";
    reasons: string[];
    failureRate: number;
    failingStreak: number;
    slowStreak: number;
    latestDurationMs: number | null;
    lastFailureAt: string | null;
  }>;
}

export interface NightlyOpsStepHotspotFollowUpLatestSnapshot {
  reportFile: string;
  available: boolean;
  generatedAt: string | null;
  ok: boolean | null;
  stale: boolean;
  ageMinutes: number | null;
  minSeverity: "high" | "medium" | "low" | null;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  questAction: {
    action: "none" | "created" | "updated" | "suppressed";
    questId: string | null;
    dedupeKey: string | null;
    failureClass: string | null;
    cooldown: {
      onCooldown: boolean;
      minutesRemaining: number;
      lastAlertAt: string | null;
    };
  } | null;
}

export interface NightlyOpsStepHotspotSummaryLatestSnapshot {
  reportFile: string;
  available: boolean;
  generatedAt: string | null;
  hotspotReportGeneratedAt: string | null;
  overall: "PASS" | "FAIL" | "UNKNOWN";
  flaggedCount: number | null;
  totalSteps: number | null;
  worstStep: string | null;
}

function getControlPlaneProjectRootPath() {
  return path.join(getWorkspaceRootPath(), getControlPlaneProjectId());
}

function readJson(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function nightlyOpsReportsPath(reportFile?: string) {
  const projectRootPath = getControlPlaneProjectRootPath();
  return reportFile
    ? path.join(projectRootPath, "reports", "ops", reportFile)
    : path.join(projectRootPath, "reports", "ops");
}

function nightlyOpsReportPath(reportFile: string) {
  return nightlyOpsReportsPath(reportFile);
}

function readJsonFromReportsDir(reportsDir: string, reportFile: string) {
  return readJson(path.join(reportsDir, reportFile));
}

function parseStatusItem(input: {
  key: NightlyOpsStatusItem["key"];
  label: string;
  reportFile: string;
  maxAgeHours: number;
  buildDetail: (payload: Record<string, unknown>) => string;
}): NightlyOpsStatusItem {
  const reportPath = nightlyOpsReportPath(input.reportFile);
  const payload = readJson(reportPath);
  if (!payload) {
    return {
      key: input.key,
      label: input.label,
      reportFile: input.reportFile,
      available: false,
      ok: null,
      generatedAt: null,
      stale: true,
      ageMinutes: null,
      detail: "not generated",
    };
  }

  const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : null;
  const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
  const ageMinutes = Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.floor((Date.now() - generatedAtMs) / 60_000))
    : null;
  const stale = ageMinutes === null ? true : ageMinutes > input.maxAgeHours * 60;
  const ok = typeof payload.ok === "boolean" ? payload.ok : null;

  return {
    key: input.key,
    label: input.label,
    reportFile: input.reportFile,
    available: true,
    ok,
    generatedAt,
    stale,
    ageMinutes,
    detail: input.buildDetail(payload),
  };
}

export function readNightlyOpsBundleLatest(): NightlyOpsBundleLatestSnapshot {
  const reportFile = "nightly-ops-bundle-latest.json";
  const reportPath = nightlyOpsReportPath(reportFile);
  const payload = readJson(reportPath);
  if (!payload) {
    return {
      reportFile,
      available: false,
      generatedAt: null,
      ok: null,
      failedCount: null,
      stepOrderVersion: null,
      steps: [],
      stepTimeline: [],
    };
  }

  const rawSteps = Array.isArray(payload.steps) ? payload.steps as Array<Record<string, unknown>> : [];
  const rawTimeline = Array.isArray(payload.stepTimeline) ? payload.stepTimeline as Array<Record<string, unknown>> : [];
  const steps: NightlyOpsBundleLatestStep[] = rawSteps.map((step) => ({
    id: String(step.id || ""),
    command: String(step.command || ""),
    ok: Boolean(step.ok),
    exitCode: Number(step.exitCode ?? 0),
    durationMs: Number(step.durationMs ?? 0),
  }));
  const stepTimeline: NightlyOpsBundleTimelineStep[] = rawTimeline.map((step) => ({
    id: String(step.id || ""),
    ok: Boolean(step.ok),
    exitCode: Number(step.exitCode ?? 0),
    durationMs: Number(step.durationMs ?? 0),
    startedOffsetMs: Number(step.startedOffsetMs ?? 0),
    finishedOffsetMs: Number(step.finishedOffsetMs ?? 0),
  }));

  return {
    reportFile,
    available: true,
    generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : null,
    ok: typeof payload.ok === "boolean" ? payload.ok : null,
    failedCount: Number.isFinite(Number(payload.failedCount)) ? Number(payload.failedCount) : null,
    stepOrderVersion: Number.isFinite(Number(payload.stepOrderVersion)) ? Number(payload.stepOrderVersion) : null,
    steps,
    stepTimeline,
  };
}

export function readNightlyOpsBundleTrend(
  options?: { limit?: number },
): NightlyOpsBundleTrendPoint[] {
  const reportsDir = nightlyOpsReportsPath();
  if (!fs.existsSync(reportsDir)) return [];
  const limit = Math.max(1, Math.floor(Number(options?.limit ?? 8)));
  const files = fs
    .readdirSync(reportsDir)
    .filter((file) => /^nightly-ops-bundle-\d{4}-\d{2}-\d{2}T.*\.json$/i.test(file))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);

  const points: NightlyOpsBundleTrendPoint[] = [];
  for (const file of files) {
    const payload = readJsonFromReportsDir(reportsDir, file);
    if (!payload) continue;
    points.push({
      reportFile: file,
      generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : null,
      ok: typeof payload.ok === "boolean" ? payload.ok : null,
      failedCount: Number(payload.failedCount ?? 0),
      durationMs: Number(payload.durationMs ?? 0),
      stepOrderVersion: Number(payload.stepOrderVersion ?? 0),
    });
  }
  return points;
}

function parseNumberFromLine(content: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^-\\s*${escaped}:\\s*([0-9]+)\\s*$`, "mi");
  const match = content.match(regex);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStringFromLine(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^-\\s*${escaped}:\\s*(.+?)\\s*$`, "mi");
  const match = content.match(regex);
  return match ? String(match[1]).trim() : null;
}

export function readNightlyOpsSummaryLatest(): NightlyOpsSummaryLatestSnapshot {
  const reportFile = "nightly-ops-summary-latest.md";
  const reportPath = nightlyOpsReportPath(reportFile);
  if (!fs.existsSync(reportPath)) {
    return {
      reportFile,
      available: false,
      generatedAt: null,
      bundleGeneratedAt: null,
      overall: "UNKNOWN",
      failedCount: null,
      durationMs: null,
      stepOrderVersion: null,
    };
  }

  const content = fs.readFileSync(reportPath, "utf8");
  const generatedAt = parseStringFromLine(content, "Generated At");
  const bundleGeneratedAt = parseStringFromLine(content, "Bundle Generated At");
  const overallRaw = parseStringFromLine(content, "Overall");
  const overall = overallRaw === "PASS" || overallRaw === "FAIL" ? overallRaw : "UNKNOWN";

  return {
    reportFile,
    available: true,
    generatedAt,
    bundleGeneratedAt,
    overall,
    failedCount: parseNumberFromLine(content, "Failed Count"),
    durationMs: parseNumberFromLine(content, "Duration (ms)"),
    stepOrderVersion: parseNumberFromLine(content, "Step Order Version"),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return (left + right) / 2;
}

function scoreHotspot(input: {
  reasons: string[];
  failureRate: number;
  failingStreak: number;
  slowStreak: number;
  durationSpikeRatio: number | null;
}): number {
  let score = 0;
  if (input.reasons.includes("failure_rate_exceeded")) score += 4;
  if (input.reasons.includes("slow_runs_exceeded")) score += 3;
  if (input.reasons.includes("duration_spike_exceeded")) score += 2;
  score += Math.min(3, Math.max(0, input.failingStreak - 1));
  score += Math.min(2, Math.max(0, input.slowStreak - 1));
  if (input.failureRate >= 0.5) score += 2;
  if ((input.durationSpikeRatio ?? 0) >= 2.5) score += 1;
  return score;
}

function severityFromScore(score: number, flagged: boolean): "low" | "medium" | "high" {
  if (!flagged) return "low";
  if (score >= 8) return "high";
  if (score >= 4) return "medium";
  return "low";
}

export function evaluateNightlyOpsTrendHealth(
  points: NightlyOpsBundleTrendPoint[],
  options?: { maxFailingRatio?: number; maxDurationSpikeRatio?: number; minRecoveryStreak?: number },
): NightlyOpsTrendHealth {
  const maxFailingRatio = Number.isFinite(options?.maxFailingRatio) ? Number(options?.maxFailingRatio) : 0.4;
  const maxDurationSpikeRatio = Number.isFinite(options?.maxDurationSpikeRatio) ? Number(options?.maxDurationSpikeRatio) : 1.75;
  const minRecoveryStreak = Number.isFinite(options?.minRecoveryStreak) ? Number(options?.minRecoveryStreak) : 3;
  const total = points.length;
  if (total < 3) {
    return {
      status: "insufficient_data",
      ok: true,
      reasons: ["insufficient_data"],
      total,
      failingCount: 0,
      failingRatio: 0,
      latestDurationMs: points[0]?.durationMs ?? null,
      medianDurationMs: null,
      spikeRatio: null,
      thresholds: { maxFailingRatio, maxDurationSpikeRatio, minRecoveryStreak },
    };
  }

  const failingCount = points.filter((point) => point.ok === false).length;
  const failingRatio = total > 0 ? failingCount / total : 0;
  let recoveryStreak = 0;
  for (const point of points) {
    if (point.ok === true) recoveryStreak += 1;
    else break;
  }
  const latestDurationMs = points[0]?.durationMs ?? null;
  const previousDurations = points
    .slice(1)
    .map((point) => point.durationMs)
    .filter((value) => Number.isFinite(value) && value > 0);
  const medianDurationMs = median(previousDurations);
  const spikeRatio =
    latestDurationMs && medianDurationMs && medianDurationMs > 0
      ? latestDurationMs / medianDurationMs
      : null;

  const reasons: string[] = [];
  if (failingRatio > maxFailingRatio && recoveryStreak < minRecoveryStreak) reasons.push("failing_ratio_exceeded");
  if (spikeRatio !== null && spikeRatio > maxDurationSpikeRatio) reasons.push("duration_spike_exceeded");
  const status: NightlyOpsTrendHealth["status"] = reasons.length > 0 ? "warning" : "healthy";
  return {
    status,
    ok: reasons.length === 0,
    reasons,
    total,
    failingCount,
    failingRatio,
    latestDurationMs,
    medianDurationMs,
    spikeRatio,
    thresholds: { maxFailingRatio, maxDurationSpikeRatio, minRecoveryStreak },
  };
}

function readNightlyOpsBundleReportFiles(
  limit: number,
): string[] {
  const reportsDir = nightlyOpsReportsPath();
  if (!fs.existsSync(reportsDir)) return [];
  return fs
    .readdirSync(reportsDir)
    .filter((file) => /^nightly-ops-bundle-\d{4}-\d{2}-\d{2}T.*\.json$/i.test(file))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);
}

export function readNightlyOpsStepHotspots(
  options?: {
    limit?: number;
    minSamplesPerStep?: number;
    maxFailureRate?: number;
    slowDurationMs?: number;
    maxSlowRuns?: number;
    maxDurationSpikeRatio?: number;
    minFailingStreak?: number;
    minSlowStreak?: number;
  },
): NightlyOpsStepHotspot[] {
  const limit = Math.max(3, Math.min(30, Math.floor(Number(options?.limit ?? 8))));
  const minSamplesPerStep = Number.isFinite(options?.minSamplesPerStep)
    ? Math.max(1, Math.floor(Number(options?.minSamplesPerStep)))
    : 3;
  const maxFailureRate = Number.isFinite(options?.maxFailureRate) ? Number(options?.maxFailureRate) : 0.35;
  const slowDurationMs = Number.isFinite(options?.slowDurationMs) ? Number(options?.slowDurationMs) : 180_000;
  const maxSlowRuns = Number.isFinite(options?.maxSlowRuns)
    ? Math.max(1, Math.floor(Number(options?.maxSlowRuns)))
    : 3;
  const maxDurationSpikeRatio = Number.isFinite(options?.maxDurationSpikeRatio)
    ? Number(options?.maxDurationSpikeRatio)
    : 2;
  const minFailingStreak = Number.isFinite(options?.minFailingStreak)
    ? Math.max(1, Math.floor(Number(options?.minFailingStreak)))
    : 2;
  const minSlowStreak = Number.isFinite(options?.minSlowStreak)
    ? Math.max(1, Math.floor(Number(options?.minSlowStreak)))
    : 2;

  const reportsDir = nightlyOpsReportsPath();
  const files = readNightlyOpsBundleReportFiles(limit);
  const map = new Map<string, {
    durations: number[];
    outcomes: boolean[];
    samples: number;
    failureCount: number;
    slowCount: number;
    latestDurationMs: number | null;
    lastFailureAt: string | null;
    latestReportFile: string | null;
  }>();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index] as string;
    const payload = readJsonFromReportsDir(reportsDir, file);
    if (!payload) continue;
    const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : null;
    const steps = Array.isArray(payload.steps) ? payload.steps as Array<Record<string, unknown>> : [];
    for (const step of steps) {
      const stepId = String(step.id || "").trim();
      if (!stepId) continue;
      const ok = Boolean(step.ok);
      const rawDuration = Number(step.durationMs ?? 0);
      const durationMs = Number.isFinite(rawDuration) && rawDuration >= 0 ? rawDuration : 0;
      const item = map.get(stepId) ?? {
        durations: [],
        outcomes: [],
        samples: 0,
        failureCount: 0,
        slowCount: 0,
        latestDurationMs: null,
        lastFailureAt: null,
        latestReportFile: null,
      };
      item.samples += 1;
      item.durations.push(durationMs);
      item.outcomes.push(ok);
      if (durationMs >= slowDurationMs) item.slowCount += 1;
      if (!ok) {
        item.failureCount += 1;
        if (!item.lastFailureAt && generatedAt) item.lastFailureAt = generatedAt;
      }
      if (index === 0) {
        item.latestDurationMs = durationMs;
        item.latestReportFile = file;
      }
      map.set(stepId, item);
    }
  }

  return Array.from(map.entries())
    .map(([stepId, item]) => {
      const totalDuration = item.durations.reduce((sum, current) => sum + current, 0);
      const avgDurationMs = item.samples > 0 ? totalDuration / item.samples : 0;
      const durationSample = item.durations.filter((value) => Number.isFinite(value) && value > 0);
      const baselineDurations = item.durations
        .slice(1)
        .filter((value) => Number.isFinite(value) && value > 0);
      const medianDurationMs = median(baselineDurations.length > 0 ? baselineDurations : durationSample);
      const durationSpikeRatio =
        item.latestDurationMs && medianDurationMs && medianDurationMs > 0
          ? item.latestDurationMs / medianDurationMs
          : null;
      const failureRate = item.samples > 0 ? item.failureCount / item.samples : 0;
      let failingStreak = 0;
      for (const ok of item.outcomes) {
        if (!ok) failingStreak += 1;
        else break;
      }
      let slowStreak = 0;
      for (const duration of item.durations) {
        if (duration >= slowDurationMs) slowStreak += 1;
        else break;
      }
      const latestFailed = item.outcomes[0] === false;
      const latestSlow = (item.latestDurationMs ?? 0) >= slowDurationMs;
      const reasons: string[] = [];
      if (
        item.samples >= minSamplesPerStep
        && latestFailed
        && failureRate > maxFailureRate
        && failingStreak >= minFailingStreak
      ) {
        reasons.push("failure_rate_exceeded");
      }
      if (
        item.samples >= minSamplesPerStep
        && durationSpikeRatio !== null
        && durationSpikeRatio > maxDurationSpikeRatio
      ) {
        reasons.push("duration_spike_exceeded");
      }
      if (
        item.samples >= minSamplesPerStep
        && latestSlow
        && item.slowCount > maxSlowRuns
        && slowStreak >= minSlowStreak
      ) {
        reasons.push("slow_runs_exceeded");
      }
      const flagged = reasons.length > 0;
      const severityScore = scoreHotspot({
        reasons,
        failureRate,
        failingStreak,
        slowStreak,
        durationSpikeRatio,
      });
      const severity = severityFromScore(severityScore, flagged);

      return {
        stepId,
        severity,
        severityScore,
        samples: item.samples,
        failureCount: item.failureCount,
        failureRate,
        failingStreak,
        slowCount: item.slowCount,
        slowStreak,
        avgDurationMs,
        medianDurationMs,
        latestDurationMs: item.latestDurationMs,
        durationSpikeRatio,
        lastFailureAt: item.lastFailureAt,
        latestReportFile: item.latestReportFile,
        reasons,
        flagged,
      };
    })
    .sort((left, right) => {
      if (right.severityScore !== left.severityScore) {
        return right.severityScore - left.severityScore;
      }
      if (Number(right.flagged) !== Number(left.flagged)) {
        return Number(right.flagged) - Number(left.flagged);
      }
      if (right.failureRate !== left.failureRate) {
        return right.failureRate - left.failureRate;
      }
      const rightSpike = right.durationSpikeRatio ?? 0;
      const leftSpike = left.durationSpikeRatio ?? 0;
      if (rightSpike !== leftSpike) {
        return rightSpike - leftSpike;
      }
      return right.avgDurationMs - left.avgDurationMs;
    });
}

export function evaluateNightlyOpsStepHotspotsHealth(
  hotspots: NightlyOpsStepHotspot[],
  options?: { maxFlaggedSteps?: number },
): NightlyOpsStepHotspotHealth {
  const maxFlaggedSteps = Number.isFinite(options?.maxFlaggedSteps)
    ? Math.max(0, Math.floor(Number(options?.maxFlaggedSteps)))
    : 0;
  if (hotspots.length === 0) {
    return {
      status: "insufficient_data",
      ok: true,
      reasons: ["insufficient_data"],
      totalSteps: 0,
      flaggedCount: 0,
      thresholds: { maxFlaggedSteps },
    };
  }

  const flaggedCount = hotspots.filter((item) => item.flagged).length;
  const reasons: string[] = [];
  if (flaggedCount > maxFlaggedSteps) reasons.push("flagged_steps_exceeded");
  return {
    status: reasons.length > 0 ? "warning" : "healthy",
    ok: reasons.length === 0,
    reasons,
    totalSteps: hotspots.length,
    flaggedCount,
    thresholds: { maxFlaggedSteps },
  };
}

export function readNightlyOpsStepHotspotReportLatest(
  options?: { maxAgeHours?: number },
): NightlyOpsStepHotspotReportLatest {
  const reportFile = "nightly-step-hotspots-latest.json";
  const reportPath = nightlyOpsReportPath(reportFile);
  const maxAgeHours = Number.isFinite(options?.maxAgeHours) ? Number(options?.maxAgeHours) : 30;
  const payload = readJson(reportPath);
  if (!payload) {
    return {
      reportFile,
      available: false,
      generatedAt: null,
      ok: null,
      stale: true,
      ageMinutes: null,
      flaggedCount: 0,
      totalSteps: 0,
      maxFlaggedSteps: null,
      hotspots: [],
    };
  }

  const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : null;
  const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
  const ageMinutes = Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.floor((Date.now() - generatedAtMs) / 60_000))
    : null;
  const stale = ageMinutes === null ? true : ageMinutes > maxAgeHours * 60;
  const hotspots = Array.isArray(payload.hotspots) ? payload.hotspots as NightlyOpsStepHotspot[] : [];
  const health = (payload.health || {}) as {
    flaggedCount?: unknown;
    totalSteps?: unknown;
    thresholds?: { maxFlaggedSteps?: unknown };
  };

  return {
    reportFile,
    available: true,
    generatedAt,
    ok: typeof payload.ok === "boolean" ? payload.ok : null,
    stale,
    ageMinutes,
    flaggedCount: Number(health.flaggedCount ?? 0),
    totalSteps: Number(health.totalSteps ?? hotspots.length ?? 0),
    maxFlaggedSteps: Number.isFinite(Number(health.thresholds?.maxFlaggedSteps))
      ? Number(health.thresholds?.maxFlaggedSteps)
      : null,
    hotspots,
  };
}

export function readNightlyOpsStepHotspotTrend(
  options?: { limit?: number },
): NightlyOpsStepHotspotTrendPoint[] {
  const reportsDir = nightlyOpsReportsPath();
  if (!fs.existsSync(reportsDir)) return [];
  const limit = Math.max(1, Math.floor(Number(options?.limit ?? 8)));
  const files = fs
    .readdirSync(reportsDir)
    .filter((file) => /^nightly-step-hotspots-\d{4}-\d{2}-\d{2}T.*\.json$/i.test(file))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);

  const points: NightlyOpsStepHotspotTrendPoint[] = [];
  for (const file of files) {
    const payload = readJsonFromReportsDir(reportsDir, file);
    if (!payload) continue;
    const health = (payload.health || {}) as { flaggedCount?: unknown; totalSteps?: unknown };
    points.push({
      reportFile: file,
      generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : null,
      ok: typeof payload.ok === "boolean" ? payload.ok : null,
      flaggedCount: Number(health.flaggedCount ?? 0),
      totalSteps: Number(health.totalSteps ?? 0),
    });
  }
  return points;
}

export function readNightlyOpsStepHotspotAlertsLatest(
  options?: { maxAgeHours?: number },
): NightlyOpsStepHotspotAlertsLatestSnapshot {
  const reportFile = "nightly-step-hotspots-alerts-latest.json";
  const reportPath = nightlyOpsReportPath(reportFile);
  const maxAgeHours = Number.isFinite(options?.maxAgeHours) ? Number(options?.maxAgeHours) : 30;
  const payload = readJson(reportPath);
  if (!payload) {
    return {
      reportFile,
      available: false,
      generatedAt: null,
      ok: null,
      stale: true,
      ageMinutes: null,
      alertCount: 0,
      bySeverity: { high: 0, medium: 0, low: 0 },
      alerts: [],
    };
  }

  const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : null;
  const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
  const ageMinutes = Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.floor((Date.now() - generatedAtMs) / 60_000))
    : null;
  const stale = ageMinutes === null ? true : ageMinutes > maxAgeHours * 60;
  const alerts = Array.isArray(payload.alerts)
    ? payload.alerts as NightlyOpsStepHotspotAlertsLatestSnapshot["alerts"]
    : [];
  const bySeverityRaw = (payload.bySeverity || {}) as Record<string, unknown>;

  return {
    reportFile,
    available: true,
    generatedAt,
    ok: typeof payload.ok === "boolean" ? payload.ok : null,
    stale,
    ageMinutes,
    alertCount: Number(payload.alertCount ?? alerts.length ?? 0),
    bySeverity: {
      high: Number(bySeverityRaw.high ?? 0),
      medium: Number(bySeverityRaw.medium ?? 0),
      low: Number(bySeverityRaw.low ?? 0),
    },
    alerts,
  };
}

export function readNightlyOpsStepHotspotFollowUpLatest(
  options?: { maxAgeHours?: number },
): NightlyOpsStepHotspotFollowUpLatestSnapshot {
  const reportFile = "nightly-step-hotspots-followup-latest.json";
  const reportPath = nightlyOpsReportPath(reportFile);
  const maxAgeHours = Number.isFinite(options?.maxAgeHours) ? Number(options?.maxAgeHours) : 30;
  const payload = readJson(reportPath);
  if (!payload) {
    return {
      reportFile,
      available: false,
      generatedAt: null,
      ok: null,
      stale: true,
      ageMinutes: null,
      minSeverity: null,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      questAction: null,
    };
  }

  const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : null;
  const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
  const ageMinutes = Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.floor((Date.now() - generatedAtMs) / 60_000))
    : null;
  const stale = ageMinutes === null ? true : ageMinutes > maxAgeHours * 60;
  const bySeverity = (payload.bySeverity || {}) as Record<string, unknown>;
  const minSeverityRaw = String(payload.minSeverity || "").trim().toLowerCase();
  const minSeverity = (minSeverityRaw === "high" || minSeverityRaw === "medium" || minSeverityRaw === "low")
    ? minSeverityRaw
    : null;

  return {
    reportFile,
    available: true,
    generatedAt,
    ok: typeof payload.ok === "boolean" ? payload.ok : null,
    stale,
    ageMinutes,
    minSeverity,
    highCount: Number(bySeverity.high ?? 0),
    mediumCount: Number(bySeverity.medium ?? 0),
    lowCount: Number(bySeverity.low ?? 0),
    questAction: (payload.questAction || null) as NightlyOpsStepHotspotFollowUpLatestSnapshot["questAction"],
  };
}

export function readNightlyOpsStepHotspotSummaryLatest(
): NightlyOpsStepHotspotSummaryLatestSnapshot {
  const reportFile = "nightly-step-hotspots-summary-latest.md";
  const reportPath = nightlyOpsReportPath(reportFile);
  if (!fs.existsSync(reportPath)) {
    return {
      reportFile,
      available: false,
      generatedAt: null,
      hotspotReportGeneratedAt: null,
      overall: "UNKNOWN",
      flaggedCount: null,
      totalSteps: null,
      worstStep: null,
    };
  }

  const content = fs.readFileSync(reportPath, "utf8");
  const generatedAt = parseStringFromLine(content, "Generated At");
  const hotspotReportGeneratedAt = parseStringFromLine(content, "Hotspot Report Generated At");
  const overallRaw = parseStringFromLine(content, "Overall");
  const overall = overallRaw === "PASS" || overallRaw === "FAIL" ? overallRaw : "UNKNOWN";
  const worstStepRaw = parseStringFromLine(content, "Worst Step");
  const worstStep = worstStepRaw && worstStepRaw !== "-" ? worstStepRaw : null;

  return {
    reportFile,
    available: true,
    generatedAt,
    hotspotReportGeneratedAt,
    overall,
    flaggedCount: parseNumberFromLine(content, "Flagged Count"),
    totalSteps: parseNumberFromLine(content, "Total Steps"),
    worstStep,
  };
}

export function readNightlyOpsSnapshot(options?: { maxAgeHours?: number }): NightlyOpsSnapshot {
  const maxAgeHours = Number.isFinite(options?.maxAgeHours) ? Number(options?.maxAgeHours) : 30;

  const bundle = parseStatusItem({
    key: "bundle",
    label: "Nightly Bundle",
    reportFile: "nightly-ops-bundle-latest.json",
    maxAgeHours,
    buildDetail: (payload) => {
      const failedCount = Number(payload.failedCount ?? 0);
      const durationMs = Number(payload.durationMs ?? 0);
      return `failed=${failedCount}, durationMs=${durationMs}`;
    },
  });
  const bundleLatest = readNightlyOpsBundleLatest();
  const opsHealthSnapshotStep = bundleLatest.steps.find((step) => step.id === "ops_health_snapshot");

  const opsHealthSnapshot: NightlyOpsStatusItem = !bundle.available
    ? {
      key: "opsHealthSnapshot",
      label: "Ops Health Snapshot",
      reportFile: "nightly-ops-bundle-latest.json",
      available: false,
      ok: null,
      generatedAt: null,
      stale: true,
      ageMinutes: null,
      detail: "bundle missing",
    }
    : !opsHealthSnapshotStep
      ? {
        key: "opsHealthSnapshot",
        label: "Ops Health Snapshot",
        reportFile: "nightly-ops-bundle-latest.json",
        available: false,
        ok: null,
        generatedAt: bundle.generatedAt,
        stale: bundle.stale,
        ageMinutes: bundle.ageMinutes,
        detail: "step missing in bundle",
      }
      : {
        key: "opsHealthSnapshot",
        label: "Ops Health Snapshot",
        reportFile: "nightly-ops-bundle-latest.json",
        available: true,
        ok: Boolean(opsHealthSnapshotStep.ok),
        generatedAt: bundle.generatedAt,
        stale: bundle.stale,
        ageMinutes: bundle.ageMinutes,
        detail: `exitCode=${Number(opsHealthSnapshotStep.exitCode ?? 0)}, durationMs=${Number(opsHealthSnapshotStep.durationMs ?? 0)}`,
      };

  const repoSources = parseStatusItem({
    key: "repoSources",
    label: "Repo Sources",
    reportFile: "repo-sources-nightly-latest.json",
    maxAgeHours,
    buildDetail: (payload) => {
      const blocked = Number(payload.blockedCount ?? 0);
      const signature = typeof payload.failureSignature === "string"
        ? payload.failureSignature
        : "unknown";
      return `blocked=${blocked}, signature=${signature}`;
    },
  });

  const workspaceHealth = parseStatusItem({
    key: "workspaceHealth",
    label: "Workspace Health",
    reportFile: "workspace-global-health-latest.json",
    maxAgeHours,
    buildDetail: (payload) => {
      const summary = payload.summary as Record<string, unknown> | undefined;
      const projects = summary?.projects as Record<string, unknown> | undefined;
      const runtime = summary?.runtimeChecks as Record<string, unknown> | undefined;
      const healthy = Number(projects?.healthy ?? 0);
      const total = Number(projects?.total ?? 0);
      const runtimePassed = Number(runtime?.passed ?? 0);
      const runtimeTotal = Number(runtime?.total ?? 0);
      return `projects=${healthy}/${total}, runtime=${runtimePassed}/${runtimeTotal}`;
    },
  });

  const canary = parseStatusItem({
    key: "canary",
    label: "Canary",
    reportFile: "canary-latest.json",
    maxAgeHours,
    buildDetail: (payload) => {
      const failedCritical = Number(payload.failedCriticalCount ?? 0);
      return `failedCritical=${failedCritical}`;
    },
  });

  const orchestrator = parseStatusItem({
    key: "orchestrator",
    label: "Orchestrator",
    reportFile: "orchestrator-nightly-latest.json",
    maxAgeHours,
    buildDetail: (payload) => {
      const steps = Array.isArray(payload.steps) ? payload.steps : [];
      const failed = steps.filter((step) => !Boolean((step as { ok?: boolean }).ok)).length;
      return `steps=${steps.length}, failed=${failed}`;
    },
  });

  const allItems = [bundle, opsHealthSnapshot, repoSources, workspaceHealth, canary, orchestrator];
  const overallOk =
    allItems.some((item) => item.available)
      ? allItems.every((item) => item.available && item.stale === false && item.ok === true)
      : null;

  return {
    generatedAt: new Date().toISOString(),
    maxAgeHours,
    overallOk,
    items: {
      bundle,
      opsHealthSnapshot,
      repoSources,
      workspaceHealth,
      canary,
      orchestrator,
    },
  };
}
