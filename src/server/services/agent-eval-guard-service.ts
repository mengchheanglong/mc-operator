import { readFile, readdir } from "fs/promises";
import path from "path";

export type AgentEvalGuardStatus = "healthy" | "degraded" | "blocked" | "unavailable";

export interface AgentEvalGuardMetrics {
  score: number;
  failureRate: number;
  costUsd: number;
  total: number;
}

export interface AgentEvalGuardSnapshot {
  status: AgentEvalGuardStatus;
  metrics: AgentEvalGuardMetrics;
  reasons: string[];
  timestamp: string | null;
  artifactPath: string;
  thresholds: {
    minScore: number;
    maxCostUsd: number;
    maxFailureRate: number;
  };
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

function readLatestArtifactPath() {
  return path.join(process.cwd(), "reports", "evals", "latest.json");
}

export async function getAgentEvalGuardSnapshot(): Promise<AgentEvalGuardSnapshot> {
  const minScore = envNum("MISSION_CONTROL_EVAL_MIN_SCORE", 0.8);
  const maxCostUsd = envNum("MISSION_CONTROL_EVAL_MAX_COST_USD", 0.5);
  const maxFailureRate = envNum("MISSION_CONTROL_EVAL_MAX_FAILURE_RATE", 0.15);

  const scoreMargin = envNum("MISSION_CONTROL_EVAL_DEGRADED_SCORE_MARGIN", 0.05);
  const costMargin = envNum("MISSION_CONTROL_EVAL_DEGRADED_COST_USD_MARGIN", 0.1);
  const failureMargin = envNum("MISSION_CONTROL_EVAL_DEGRADED_FAILURE_RATE_MARGIN", 0.05);

  const artifactPath = readLatestArtifactPath();

  let raw: string;
  try {
    raw = await readFile(artifactPath, "utf8");
  } catch {
    return {
      status: "unavailable",
      metrics: { score: 0, failureRate: 1, costUsd: 0, total: 0 },
      reasons: ["eval_artifact_missing"],
      timestamp: null,
      artifactPath,
      thresholds: { minScore, maxCostUsd, maxFailureRate },
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      status: "unavailable",
      metrics: { score: 0, failureRate: 1, costUsd: 0, total: 0 },
      reasons: ["eval_artifact_malformed_json"],
      timestamp: null,
      artifactPath,
      thresholds: { minScore, maxCostUsd, maxFailureRate },
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
      metrics,
      reasons: ["eval_artifact_missing_totals"],
      timestamp,
      artifactPath,
      thresholds: { minScore, maxCostUsd, maxFailureRate },
    };
  }

  const reasons: string[] = [];
  if (metrics.score < minScore) reasons.push("score_below_threshold");
  if (metrics.costUsd > maxCostUsd) reasons.push("cost_above_threshold");
  if (metrics.failureRate > maxFailureRate) reasons.push("failure_rate_above_threshold");

  if (reasons.length > 0) {
    return {
      status: "blocked",
      metrics,
      reasons,
      timestamp,
      artifactPath,
      thresholds: { minScore, maxCostUsd, maxFailureRate },
    };
  }

  const degradedReasons: string[] = [];
  if (metrics.score < minScore + Math.max(0, scoreMargin)) degradedReasons.push("score_near_threshold");
  if (metrics.costUsd > maxCostUsd - Math.max(0, costMargin)) degradedReasons.push("cost_near_threshold");
  if (metrics.failureRate > maxFailureRate - Math.max(0, failureMargin)) degradedReasons.push("failure_rate_near_threshold");

  return {
    status: degradedReasons.length > 0 ? "degraded" : "healthy",
    metrics,
    reasons: degradedReasons,
    timestamp,
    artifactPath,
    thresholds: { minScore, maxCostUsd, maxFailureRate },
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
