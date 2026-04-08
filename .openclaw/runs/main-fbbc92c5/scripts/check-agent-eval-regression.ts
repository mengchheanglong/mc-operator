import { listRecentAgentEvalSummaries } from "../src/server/services/agent-eval-guard-service.ts";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function main() {
  const historyLimit = Math.max(4, Math.floor(envNum("MISSION_CONTROL_EVAL_REGRESSION_HISTORY_LIMIT", 10)));
  const windowSize = Math.max(2, Math.floor(envNum("MISSION_CONTROL_EVAL_REGRESSION_WINDOW_SIZE", 3)));
  const scoreDropTolerance = envNum("MISSION_CONTROL_EVAL_REGRESSION_SCORE_DROP_TOLERANCE", 0.03);
  const failureRiseTolerance = envNum("MISSION_CONTROL_EVAL_REGRESSION_FAILURE_RISE_TOLERANCE", 0.03);

  const latestFirst = await listRecentAgentEvalSummaries(historyLimit);
  const oldestFirst = [...latestFirst].reverse();

  if (oldestFirst.length < windowSize * 2) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        reason: "insufficient_history",
        required: windowSize * 2,
        available: oldestFirst.length,
      }, null, 2)}\n`,
    );
    return;
  }

  const previousWindow = oldestFirst.slice(-(windowSize * 2), -windowSize);
  const latestWindow = oldestFirst.slice(-windowSize);

  const previousAvgScore = average(previousWindow.map((row) => row.score));
  const latestAvgScore = average(latestWindow.map((row) => row.score));
  const previousAvgFailureRate = average(previousWindow.map((row) => row.failureRate));
  const latestAvgFailureRate = average(latestWindow.map((row) => row.failureRate));

  const scoreDelta = latestAvgScore - previousAvgScore;
  const failureRateDelta = latestAvgFailureRate - previousAvgFailureRate;

  const scoreTrendDown = scoreDelta < 0 && Math.abs(scoreDelta) > scoreDropTolerance;
  const failureTrendUp = failureRateDelta > failureRiseTolerance;

  const result = {
    ok: !(scoreTrendDown || failureTrendUp),
    historyCount: oldestFirst.length,
    historyLimit,
    windowSize,
    scoreDropTolerance,
    failureRiseTolerance,
    previousWindow: {
      from: previousWindow[0]?.generatedAt || null,
      to: previousWindow.at(-1)?.generatedAt || null,
      averageScore: Number(previousAvgScore.toFixed(3)),
      averageFailureRate: Number(previousAvgFailureRate.toFixed(3)),
    },
    latestWindow: {
      from: latestWindow[0]?.generatedAt || null,
      to: latestWindow.at(-1)?.generatedAt || null,
      averageScore: Number(latestAvgScore.toFixed(3)),
      averageFailureRate: Number(latestAvgFailureRate.toFixed(3)),
    },
    deltas: {
      score: Number(scoreDelta.toFixed(3)),
      failureRate: Number(failureRateDelta.toFixed(3)),
    },
    regressions: {
      scoreTrendDown,
      failureTrendUp,
    },
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

void main();
