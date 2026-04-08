import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readNightlyOpsStepHotspotAlertsLatest } from "../src/server/services/nightly-ops-status-service.ts";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const reportPath = path.join(process.cwd(), "reports", "ops", "nightly-step-hotspots-alerts-latest.json");
  if (!existsSync(reportPath)) {
    process.stderr.write(`Missing nightly hotspot alert feed: ${reportPath}\n`);
    process.exit(1);
  }

  const maxAgeHours = Math.max(1, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_ALERT_FEED_MAX_AGE_HOURS", 30)));
  const failOnHigh = String(process.env.MISSION_CONTROL_NIGHTLY_HOTSPOT_ALERT_FAIL_ON_HIGH || "").toLowerCase() === "true";
  const feed = readNightlyOpsStepHotspotAlertsLatest(process.cwd(), { maxAgeHours });
  const payload = JSON.parse(readFileSync(reportPath, "utf8")) as { bySeverity?: { high?: unknown } };
  const highCount = Number(payload.bySeverity?.high ?? feed.bySeverity.high ?? 0);

  const ok = feed.available && !feed.stale && (!failOnHigh || highCount === 0);
  const output = {
    ok,
    reportPath,
    maxAgeHours,
    failOnHigh,
    available: feed.available,
    stale: feed.stale,
    generatedAt: feed.generatedAt,
    alertCount: feed.alertCount,
    bySeverity: feed.bySeverity,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
