import {
  evaluateNightlyOpsTrendHealth,
  readNightlyOpsBundleTrend,
} from "../src/server/services/nightly-ops-status-service.ts";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const limit = Math.max(3, Math.min(30, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_TREND_LIMIT", 8))));
  const maxFailingRatio = Math.max(0, Math.min(1, envNum("MISSION_CONTROL_NIGHTLY_MAX_FAILING_RATIO", 0.4)));
  const maxDurationSpikeRatio = Math.max(1, envNum("MISSION_CONTROL_NIGHTLY_MAX_DURATION_SPIKE_RATIO", 1.75));
  const minRecoveryStreak = Math.max(1, Math.min(limit, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_MIN_RECOVERY_STREAK", 3))));
  const trend = readNightlyOpsBundleTrend(process.cwd(), { limit });
  const health = evaluateNightlyOpsTrendHealth(trend, {
    maxFailingRatio,
    maxDurationSpikeRatio,
    minRecoveryStreak,
  });

  const output = {
    ok: health.ok,
    limit,
    minRecoveryStreak,
    count: trend.length,
    health,
    trend: trend.map((point) => ({
      generatedAt: point.generatedAt,
      ok: point.ok,
      failedCount: point.failedCount,
      durationMs: point.durationMs,
      reportFile: point.reportFile,
    })),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!health.ok) process.exit(1);
}

main();
