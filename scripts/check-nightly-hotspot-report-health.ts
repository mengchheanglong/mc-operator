import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readNightlyOpsStepHotspotReportLatest } from "../src/server/services/nightly-ops-status-service.ts";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const reportPath = path.join(process.cwd(), "reports", "ops", "nightly-step-hotspots-latest.json");
  if (!existsSync(reportPath)) {
    process.stderr.write(`Missing nightly hotspot report: ${reportPath}\n`);
    process.exit(1);
  }

  const maxAgeHours = Math.max(1, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_REPORT_MAX_AGE_HOURS", 30)));
  const snapshot = readNightlyOpsStepHotspotReportLatest(process.cwd(), { maxAgeHours });
  const payload = JSON.parse(readFileSync(reportPath, "utf8")) as { health?: { totalSteps?: unknown } };
  const totalSteps = Number(payload?.health?.totalSteps ?? snapshot.totalSteps ?? 0);
  const hasSamples = totalSteps > 0;
  const ok = snapshot.available && !snapshot.stale && snapshot.ok === true && hasSamples;

  const output = {
    ok,
    reportPath,
    maxAgeHours,
    available: snapshot.available,
    stale: snapshot.stale,
    generatedAt: snapshot.generatedAt,
    flaggedCount: snapshot.flaggedCount,
    totalSteps,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
