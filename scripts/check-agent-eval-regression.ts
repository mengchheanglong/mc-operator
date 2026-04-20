import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type EvalSnapshot = {
  generatedAt?: string;
  score?: number;
  failureRate?: number;
  total?: number;
  source: string;
};

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readSnapshot(filePath: string, source: string): EvalSnapshot | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      generatedAt?: string;
      score?: number;
      failureRate?: number;
      total?: number;
    };

    const score = Number(parsed.score);
    const failureRate = Number(parsed.failureRate);
    const total = Number(parsed.total ?? 0);

    if (!Number.isFinite(score) || !Number.isFinite(failureRate)) {
      return null;
    }

    return {
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : undefined,
      score,
      failureRate,
      total: Number.isFinite(total) ? total : 0,
      source,
    };
  } catch {
    return null;
  }
}

function snapshotTime(snapshot: EvalSnapshot) {
  const ts = Date.parse(snapshot.generatedAt || "");
  return Number.isFinite(ts) ? ts : 0;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function collectSnapshots(reportsDir: string, historyLimit: number) {
  const snapshots: EvalSnapshot[] = [];
  const latestPath = path.join(reportsDir, "latest.json");

  if (existsSync(latestPath)) {
    const latest = readSnapshot(latestPath, "latest.json");
    if (latest) snapshots.push(latest);
  }

  if (!existsSync(reportsDir)) {
    return snapshots;
  }

  const historicalFiles = readdirSync(reportsDir)
    .filter((name) => /^eval-.*\.json$/i.test(name))
    .sort((left, right) => right.localeCompare(left))
    .slice(0, historyLimit);

  for (const file of historicalFiles) {
    const snapshot = readSnapshot(path.join(reportsDir, file), file);
    if (!snapshot) continue;

    const duplicate = snapshots.some(
      (existing) =>
        existing.generatedAt === snapshot.generatedAt
        && existing.score === snapshot.score
        && existing.failureRate === snapshot.failureRate,
    );

    if (!duplicate) snapshots.push(snapshot);
  }

  snapshots.sort((left, right) => snapshotTime(right) - snapshotTime(left));
  return snapshots;
}

function main() {
  const reportsDir = path.join(process.cwd(), "reports", "evals");
  const historyLimit = Math.max(2, Math.floor(envNum("MISSION_CONTROL_EVAL_REGRESSION_HISTORY_LIMIT", 10)));
  const windowSize = Math.max(1, Math.floor(envNum("MISSION_CONTROL_EVAL_REGRESSION_WINDOW_SIZE", 3)));
  const scoreDropTolerance = Math.max(0, envNum("MISSION_CONTROL_EVAL_REGRESSION_SCORE_DROP_TOLERANCE", 0.03));
  const failureRiseTolerance = Math.max(0, envNum("MISSION_CONTROL_EVAL_REGRESSION_FAILURE_RISE_TOLERANCE", 0.03));

  if (!existsSync(reportsDir)) {
    process.stderr.write(`Missing eval report directory: ${reportsDir}\n`);
    process.exit(1);
  }

  const snapshots = collectSnapshots(reportsDir, historyLimit);
  const requiredSnapshots = windowSize * 2;

  if (snapshots.length < requiredSnapshots) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        skipped: true,
        reason: "insufficient_history",
        snapshotCount: snapshots.length,
        requiredSnapshots,
        windowSize,
        historyLimit,
      }, null, 2)}\n`,
    );
    return;
  }

  const currentWindow = snapshots.slice(0, windowSize);
  const previousWindow = snapshots.slice(windowSize, windowSize * 2);

  const currentScoreAvg = average(currentWindow.map((row) => row.score || 0));
  const previousScoreAvg = average(previousWindow.map((row) => row.score || 0));
  const scoreDrop = previousScoreAvg - currentScoreAvg;

  const currentFailureAvg = average(currentWindow.map((row) => row.failureRate || 0));
  const previousFailureAvg = average(previousWindow.map((row) => row.failureRate || 0));
  const failureRise = currentFailureAvg - previousFailureAvg;

  const scoreOk = scoreDrop <= scoreDropTolerance;
  const failureOk = failureRise <= failureRiseTolerance;
  const ok = scoreOk && failureOk;

  const output = {
    ok,
    skipped: false,
    windowSize,
    historyLimit,
    snapshotCount: snapshots.length,
    scoreDropTolerance,
    failureRiseTolerance,
    currentScoreAvg: Number(currentScoreAvg.toFixed(3)),
    previousScoreAvg: Number(previousScoreAvg.toFixed(3)),
    scoreDrop: Number(scoreDrop.toFixed(3)),
    scoreOk,
    currentFailureAvg: Number(currentFailureAvg.toFixed(3)),
    previousFailureAvg: Number(previousFailureAvg.toFixed(3)),
    failureRise: Number(failureRise.toFixed(3)),
    failureOk,
    comparedCurrentSources: currentWindow.map((row) => row.source),
    comparedPreviousSources: previousWindow.map((row) => row.source),
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();