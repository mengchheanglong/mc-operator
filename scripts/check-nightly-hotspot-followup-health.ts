import { existsSync } from "node:fs";
import path from "node:path";
import { readNightlyOpsStepHotspotFollowUpLatest } from "../src/server/services/nightly-ops-status-service.ts";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const reportPath = path.join(process.cwd(), "reports", "ops", "nightly-step-hotspots-followup-latest.json");
  if (!existsSync(reportPath)) {
    process.stderr.write(`Missing nightly hotspot follow-up report: ${reportPath}\n`);
    process.exit(1);
  }

  const maxAgeHours = Math.max(1, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_FOLLOWUP_MAX_AGE_HOURS", 30)));
  const snapshot = readNightlyOpsStepHotspotFollowUpLatest(process.cwd(), { maxAgeHours });
  const ok = snapshot.available && !snapshot.stale && snapshot.questAction !== null;

  const output = {
    ok,
    reportPath,
    maxAgeHours,
    available: snapshot.available,
    stale: snapshot.stale,
    generatedAt: snapshot.generatedAt,
    minSeverity: snapshot.minSeverity,
    selectedAlerts: snapshot.highCount + snapshot.mediumCount + snapshot.lowCount,
    questAction: snapshot.questAction,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
