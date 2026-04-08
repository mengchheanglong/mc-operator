import { readNightlyOpsBundleTrend } from "../src/server/services/nightly-ops-status-service.ts";
import fs from "node:fs";
import path from "node:path";

type NightlyStep = { id?: string; ok?: boolean };

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const windowSize = Math.max(3, Math.min(30, Math.floor(envNum("MISSION_CONTROL_REPEAT_FAILURE_WINDOW", 8))));
  const threshold = Math.max(2, Math.min(windowSize, Math.floor(envNum("MISSION_CONTROL_REPEAT_FAILURE_THRESHOLD", 3))));
  const trend = readNightlyOpsBundleTrend(process.cwd(), { limit: windowSize });
  const reportsDir = path.join(process.cwd(), "reports", "ops");

  if (trend.length === 0) {
    process.stdout.write(`${JSON.stringify({ ok: true, windowSize, threshold, consideredRuns: 0, repeatedFailures: [] }, null, 2)}\n`);
    return;
  }

  // Alert only when failures are currently persistent (consecutive failing latest runs).
  const latest = trend[0];
  if (latest?.ok === true) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        windowSize,
        threshold,
        consideredRuns: trend.length,
        analyzedFailingStreak: 0,
        repeatedFailures: [],
      }, null, 2)}\n`,
    );
    return;
  }

  const failingStreak = trend.filter((point) => point.ok === false);
  let streakLength = 0;
  for (const point of trend) {
    if (point.ok === false) streakLength += 1;
    else break;
  }
  const streakRuns = failingStreak.slice(0, streakLength);

  const counts = new Map<string, number>();
  for (const point of streakRuns) {
    const payloadPath = path.join(reportsDir, point.reportFile);
    try {
      const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8")) as { steps?: NightlyStep[] };
      const steps = Array.isArray(payload.steps) ? payload.steps : [];
      for (const step of steps) {
        if (!step?.id) continue;
        if (step.ok === false) {
          counts.set(step.id, (counts.get(step.id) || 0) + 1);
        }
      }
    } catch {
      // ignore invalid payloads
    }
  }

  const repeated = Array.from(counts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([stepId, count]) => ({ stepId, count }));
  const ok = repeated.length === 0;
  const output = {
    ok,
    windowSize,
    threshold,
    consideredRuns: trend.length,
    analyzedFailingStreak: streakRuns.length,
    repeatedFailures: repeated,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
