import fs from "node:fs";
import path from "node:path";
import { readNightlyOpsStepHotspotReportLatest } from "../src/server/services/nightly-ops-status-service.ts";

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function main() {
  const now = new Date();
  const report = readNightlyOpsStepHotspotReportLatest(process.cwd(), { maxAgeHours: 30 });
  if (!report.available) {
    process.stderr.write("Missing hotspot report: reports/ops/nightly-step-hotspots-latest.json\n");
    process.exit(1);
  }

  const alerts = report.hotspots
    .filter((item) => item.flagged)
    .map((item) => ({
      stepId: item.stepId,
      severity: item.severity,
      reasons: item.reasons,
      failureRate: item.failureRate,
      failingStreak: item.failingStreak,
      slowStreak: item.slowStreak,
      latestDurationMs: item.latestDurationMs,
      lastFailureAt: item.lastFailureAt,
    }))
    .sort((left, right) => {
      const rank = (value: string) => (value === "high" ? 3 : value === "medium" ? 2 : 1);
      if (rank(right.severity) !== rank(left.severity)) return rank(right.severity) - rank(left.severity);
      return right.failureRate - left.failureRate;
    });

  const bySeverity = {
    high: alerts.filter((item) => item.severity === "high").length,
    medium: alerts.filter((item) => item.severity === "medium").length,
    low: alerts.filter((item) => item.severity === "low").length,
  };
  const payload = {
    generatedAt: now.toISOString(),
    ok: bySeverity.high === 0,
    sourceGeneratedAt: report.generatedAt,
    alertCount: alerts.length,
    bySeverity,
    alerts,
  };

  const reportsDir = path.join(process.cwd(), "reports", "ops");
  fs.mkdirSync(reportsDir, { recursive: true });
  const timestamped = path.join(reportsDir, `nightly-step-hotspots-alerts-${toTimestampForFile(now)}.json`);
  const latest = path.join(reportsDir, "nightly-step-hotspots-alerts-latest.json");
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(timestamped, serialized, "utf8");
  fs.writeFileSync(latest, serialized, "utf8");
  process.stdout.write(
    `${JSON.stringify({ ok: payload.ok, reports: { timestamped, latest }, bySeverity, alertCount: payload.alertCount }, null, 2)}\n`,
  );
}

main();
