import {
  evaluateNightlyOpsStepHotspotsHealth,
  readNightlyOpsStepHotspots,
} from "../src/server/services/nightly-ops-status-service.ts";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const limit = Math.max(3, Math.min(30, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_LIMIT", 8))));
  const minSamplesPerStep = Math.max(1, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_MIN_SAMPLES", 3)));
  const maxFailureRate = Math.max(0, Math.min(1, envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_MAX_FAILURE_RATE", 0.35)));
  const slowDurationMs = Math.max(1_000, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_SLOW_DURATION_MS", 180_000)));
  const maxSlowRuns = Math.max(1, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_MAX_SLOW_RUNS", 3)));
  const maxDurationSpikeRatio = Math.max(1, envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_MAX_DURATION_SPIKE_RATIO", 2));
  const minFailingStreak = Math.max(1, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_MIN_FAILING_STREAK", 2)));
  const minSlowStreak = Math.max(1, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_MIN_SLOW_STREAK", 2)));
  const maxFlaggedSteps = Math.max(0, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_MAX_FLAGGED_STEPS", 0)));

  const hotspots = readNightlyOpsStepHotspots(process.cwd(), {
    limit,
    minSamplesPerStep,
    maxFailureRate,
    slowDurationMs,
    maxSlowRuns,
    maxDurationSpikeRatio,
    minFailingStreak,
    minSlowStreak,
  });
  const health = evaluateNightlyOpsStepHotspotsHealth(hotspots, { maxFlaggedSteps });

  const output = {
    ok: health.ok,
    count: hotspots.length,
    health,
    thresholds: {
      limit,
      minSamplesPerStep,
      maxFailureRate,
      slowDurationMs,
      maxSlowRuns,
      maxDurationSpikeRatio,
      minFailingStreak,
      minSlowStreak,
      maxFlaggedSteps,
    },
    hotspots,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!health.ok) process.exit(1);
}

main();
