import { readFile, readdir } from "fs/promises";
import path from "path";

export type AgentEvalGuardStatus = "healthy" | "degraded" | "blocked" | "unavailable";
export type AgentEvalPromotionStatus = "ready" | "blocked_eval" | "blocked_regression";

export interface AgentEvalGuardMetrics {
  score: number;
  failureRate: number;
  costUsd: number;
  total: number;
}

export interface AgentEvalRegressionSnapshot {
  ok: boolean;
  reason: "insufficient_history" | "pass" | "score_regression" | "failure_rate_regression";
  required: number;
  available: number;
  currentScore: number;
  baselineScore: number;
  delta: number;
  threshold: number;
  artifactPaths: string[];
}

export interface AgentEvalGuardSnapshot {
  status: AgentEvalGuardStatus;
  promotionStatus: AgentEvalPromotionStatus;
  metrics: AgentEvalGuardMetrics;
  reasons: string[];
  timestamp: string | null;
  artifactPath: string;
  artifactPaths: string[];
  thresholds: {
    minScore: number;
    maxCostUsd: number;
    maxFailureRate: number;
  };
  regression?: AgentEvalRegressionSnapshot;
  nextStepCommands: string[];
}

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNum(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readLatestArtifactPath() {
  return path.join(process.cwd(), "reports", "evals", "latest.json");
}

function readLatestSummaryArtifactPath() {
  return path.join(process.cwd(), "reports", "evals", "latest-summary.md");
}

function promotionCommands() {
  return [
    "npm run eval:agents",
    "npm run check:agent-evals",
    "npm run check:agent-eval-regression",
  ];
}

function resolvePromotionStatus(input: { status: AgentEvalGuardStatus; regression?: AgentEvalRegressionSnapshot }): AgentEvalPromotionStatus {
  if (input.status === "blocked" && input.regression && !input.regression.ok) return "blocked_regression";
  if (input.status === "blocked" || input.status === "unavailable") return "blocked_eval";
  return "ready";
}

export async function evaluateAgentEvalRegression(): Promise<AgentEvalRegressionSnapshot> {
  const historyLimit = Math.max(4, Math.floor(envNum("MISSION_CONTROL_EVAL_REGRESSION_HISTORY_LIMIT", 10)));
  const windowSize = Math.max(2, Math.floor(envNum("MISSION_CONTROL_EVAL_REGRESSION_WINDOW_SIZE", 3)));
  const scoreDropTolerance = envNum("MISSION_CONTROL_EVAL_REGRESSION_SCORE_DROP_TOLERANCE", 0.03);
  const failureRiseTolerance = envNum("MISSION_CONTROL_EVAL_REGRESSION_FAILURE_RISE_TOLERANCE", 0.03);

  const latestFirst = await listRecentAgentEvalSummaries(historyLimit);
  const oldestFirst = [...latestFirst].reverse();
  const required = windowSize * 2;
  const available = oldestFirst.length;

  const artifactPaths = oldestFirst.map((row) => row.path);

  if (available < required) {
    return {
      ok: true,
      reason: "insufficient_history",
      required,
      available,
      currentScore: Number((oldestFirst.at(-1)?.score ?? 0).toFixed(3)),
      baselineScore: 0,
      delta: 0,
      threshold: scoreDropTolerance,
      artifactPaths,
    };
  }

  const previousWindow = oldestFirst.slice(-required, -windowSize);
  const latestWindow = oldestFirst.slice(-windowSize);

  const baselineScore = average(previousWindow.map((row) => row.score));
  const currentScore = average(latestWindow.map((row) => row.score));
  const scoreDelta = currentScore - baselineScore;

  const baselineFailureRate = average(previousWindow.map((row) => row.failureRate));
  const currentFailureRate = average(latestWindow.map((row) => row.failureRate));
  const failureRateDelta = currentFailureRate - baselineFailureRate;

  if (scoreDelta < 0 && Math.abs(scoreDelta) > scoreDropTolerance) {
    return {
      ok: false,
      reason: "score_regression",
      required,
      available,
      currentScore: Number(currentScore.toFixed(3)),
      baselineScore: Number(baselineScore.toFixed(3)),
      delta: Number(scoreDelta.toFixed(3)),
      threshold: scoreDropTolerance,
      artifactPaths,
    };
  }

  if (failureRateDelta > failureRiseTolerance) {
    return {
      ok: false,
      reason: "failure_rate_regression",
      required,
      available,
      currentScore: Number(currentFailureRate.toFixed(3)),
      baselineScore: Number(baselineFailureRate.toFixed(3)),
      delta: Number(failureRateDelta.toFixed(3)),
      threshold: failureRiseTolerance,
      artifactPaths,
    };
  }

  return {
    ok: true,
    reason: "pass",
    required,
    available,
    currentScore: Number(currentScore.toFixed(3)),
    baselineScore: Number(baselineScore.toFixed(3)),
    delta: Number(scoreDelta.toFixed(3)),
    threshold: scoreDropTolerance,
    artifactPaths,
  };
}

export async function getAgentEvalGuardSnapshot(): Promise<AgentEvalGuardSnapshot> {
  const minScore = envNum("MISSION_CONTROL_EVAL_MIN_SCORE", 0.8);
  const maxCostUsd = envNum("MISSION_CONTROL_EVAL_MAX_COST_USD", 0.5);
  const maxFailureRate = envNum("MISSION_CONTROL_EVAL_MAX_FAILURE_RATE", 0.15);

  const scoreMargin = envNum("MISSION_CONTROL_EVAL_DEGRADED_SCORE_MARGIN", 0.05);
  const costMargin = envNum("MISSION_CONTROL_EVAL_DEGRADED_COST_USD_MARGIN", 0.1);
  const failureMargin = envNum("MISSION_CONTROL_EVAL_DEGRADED_FAILURE_RATE_MARGIN", 0.05);

  const artifactPath = readLatestArtifactPath();
  const summaryPath = readLatestSummaryArtifactPath();
  const baseArtifactPaths = [artifactPath, summaryPath];
  const nextStepCommands = promotionCommands();

  let raw: string;
  try {
    raw = await readFile(artifactPath, "utf8");
  } catch {
    return {
      status: "unavailable",
      promotionStatus: "blocked_eval",
      metrics: { score: 0, failureRate: 1, costUsd: 0, total: 0 },
      reasons: ["eval_artifact_missing"],
      timestamp: null,
      artifactPath,
      artifactPaths: baseArtifactPaths,
      thresholds: { minScore, maxCostUsd, maxFailureRate },
      nextStepCommands,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      status: "unavailable",
      promotionStatus: "blocked_eval",
      metrics: { score: 0, failureRate: 1, costUsd: 0, total: 0 },
      reasons: ["eval_artifact_malformed_json"],
      timestamp: null,
      artifactPath,
      artifactPaths: baseArtifactPaths,
      thresholds: { minScore, maxCostUsd, maxFailureRate },
      nextStepCommands,
    };
  }

  const metrics: AgentEvalGuardMetrics = {
    score: toNum(parsed.score, 0),
    failureRate: toNum(parsed.failureRate, 1),
    costUsd: toNum(parsed.costUsd, 0),
    total: toNum(parsed.total, 0),
  };
  const timestamp = typeof parsed.generatedAt === "string" ? parsed.generatedAt : null;

  if (metrics.total <= 0) {
    return {
      status: "unavailable",
      promotionStatus: "blocked_eval",
      metrics,
      reasons: ["eval_artifact_missing_totals"],
      timestamp,
      artifactPath,
      artifactPaths: baseArtifactPaths,
      thresholds: { minScore, maxCostUsd, maxFailureRate },
      nextStepCommands,
    };
  }

  const reasons: string[] = [];
  if (metrics.score < minScore) reasons.push("score_below_threshold");
  if (metrics.costUsd > maxCostUsd) reasons.push("cost_above_threshold");
  if (metrics.failureRate > maxFailureRate) reasons.push("failure_rate_above_threshold");

  if (reasons.length > 0) {
    const status: AgentEvalGuardStatus = "blocked";
    return {
      status,
      promotionStatus: resolvePromotionStatus({ status }),
      metrics,
      reasons,
      timestamp,
      artifactPath,
      artifactPaths: baseArtifactPaths,
      thresholds: { minScore, maxCostUsd, maxFailureRate },
      nextStepCommands,
    };
  }

  const regression = await evaluateAgentEvalRegression();
  if (!regression.ok) {
    const status: AgentEvalGuardStatus = "blocked";
    return {
      status,
      promotionStatus: resolvePromotionStatus({ status, regression }),
      metrics,
      reasons: ["eval_regression_detected", regression.reason],
      timestamp,
      artifactPath,
      artifactPaths: [...baseArtifactPaths, ...regression.artifactPaths],
      thresholds: { minScore, maxCostUsd, maxFailureRate },
      regression,
      nextStepCommands,
    };
  }

  const degradedReasons: string[] = [];
  if (metrics.score < minScore + Math.max(0, scoreMargin)) degradedReasons.push("score_near_threshold");
  if (metrics.costUsd > maxCostUsd - Math.max(0, costMargin)) degradedReasons.push("cost_near_threshold");
  if (metrics.failureRate > maxFailureRate - Math.max(0, failureMargin)) degradedReasons.push("failure_rate_near_threshold");

  const status: AgentEvalGuardStatus = degradedReasons.length > 0 ? "degraded" : "healthy";
  return {
    status,
    promotionStatus: resolvePromotionStatus({ status, regression }),
    metrics,
    reasons: degradedReasons,
    timestamp,
    artifactPath,
    artifactPaths: [...baseArtifactPaths, ...regression.artifactPaths],
    thresholds: { minScore, maxCostUsd, maxFailureRate },
    regression,
    nextStepCommands,
  };
}

export async function listRecentAgentEvalSummaries(limit = 10): Promise<Array<{
  generatedAt: string;
  score: number;
  failureRate: number;
  costUsd: number;
  total: number;
  path: string;
}>> {
  const evalDir = path.join(process.cwd(), "reports", "evals");
  const maxItems = Number.isFinite(limit) ? Math.max(2, Math.floor(limit)) : 10;

  let fileNames: string[] = [];
  try {
    fileNames = await readdir(evalDir);
  } catch {
    return [];
  }

  const candidates = fileNames
    .filter((name) => /^eval-\d{8}T\d{6}Z\.json$/i.test(name))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, maxItems);

  const rows = await Promise.all(
    candidates.map(async (name) => {
      const fullPath = path.join(evalDir, name);
      try {
        const parsed = JSON.parse(await readFile(fullPath, "utf8")) as Record<string, unknown>;
        return {
          generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : name,
          score: toNum(parsed.score, 0),
          failureRate: toNum(parsed.failureRate, 1),
          costUsd: toNum(parsed.costUsd, 0),
          total: toNum(parsed.total, 0),
          path: fullPath,
        };
      } catch {
        return null;
      }
    }),
  );

  return rows.filter((row): row is NonNullable<typeof row> => Boolean(row));
}
