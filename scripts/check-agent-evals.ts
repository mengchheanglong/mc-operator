import { existsSync, readFileSync } from "fs";
import path from "path";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

function main() {
  const latestPath = path.join(process.cwd(), "reports", "evals", "latest.json");
  if (!existsSync(latestPath)) {
    process.stderr.write(`Missing eval artifact: ${latestPath}\n`);
    process.exit(1);
  }

  const latest = JSON.parse(readFileSync(latestPath, "utf8")) as {
    score?: number;
    costUsd?: number;
    failureRate?: number;
    total?: number;
  };

  const minScore = envNum("MISSION_CONTROL_EVAL_MIN_SCORE", 0.8);
  const maxCostUsd = envNum("MISSION_CONTROL_EVAL_MAX_COST_USD", 0.5);
  const maxFailureRate = envNum("MISSION_CONTROL_EVAL_MAX_FAILURE_RATE", 0.15);

  const score = Number(latest.score || 0);
  const costUsd = Number(latest.costUsd || 0);
  const failureRate = Number(latest.failureRate ?? 1);

  const checks = {
    minScore,
    maxCostUsd,
    maxFailureRate,
    score,
    costUsd,
    failureRate,
    scoreOk: score >= minScore,
    costOk: costUsd <= maxCostUsd,
    failureRateOk: failureRate <= maxFailureRate,
    total: Number(latest.total || 0),
  };

  process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);

  if (!checks.scoreOk || !checks.costOk || !checks.failureRateOk) {
    process.exit(1);
  }
}

main();
