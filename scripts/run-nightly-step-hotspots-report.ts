import fs from "node:fs";
import path from "node:path";
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

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function main() {
  const now = new Date();
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
  const payload = {
    generatedAt: now.toISOString(),
    ok: health.ok,
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

  const reportsDir = path.join(process.cwd(), "reports", "ops");
  fs.mkdirSync(reportsDir, { recursive: true });
  const timestamped = path.join(reportsDir, `nightly-step-hotspots-${toTimestampForFile(now)}.json`);
  const latest = path.join(reportsDir, "nightly-step-hotspots-latest.json");
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(timestamped, serialized, "utf8");
  fs.writeFileSync(latest, serialized, "utf8");

  process.stdout.write(
    `${JSON.stringify({ ok: payload.ok, reports: { timestamped, latest }, flaggedCount: health.flaggedCount }, null, 2)}\n`,
  );
  if (!payload.ok) process.exit(1);
}

main();
