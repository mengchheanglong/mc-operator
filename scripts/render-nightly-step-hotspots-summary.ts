import fs from "node:fs";
import path from "node:path";
import { readNightlyOpsStepHotspotReportLatest } from "../src/server/services/nightly-ops-status-service.ts";

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function statusBadge(ok: boolean) {
  return ok ? "PASS" : "FAIL";
}

function main() {
  const now = new Date();
  const report = readNightlyOpsStepHotspotReportLatest(process.cwd(), { maxAgeHours: 30 });
  if (!report.available) {
    process.stderr.write("Missing hotspot report: reports/ops/nightly-step-hotspots-latest.json\n");
    process.exit(1);
  }

  const hotspots = [...report.hotspots].sort((left, right) => {
    if (Number(right.flagged) !== Number(left.flagged)) {
      return Number(right.flagged) - Number(left.flagged);
    }
    if (right.failureRate !== left.failureRate) {
      return right.failureRate - left.failureRate;
    }
    return (right.durationSpikeRatio ?? 0) - (left.durationSpikeRatio ?? 0);
  });
  const worst = hotspots[0] ?? null;

  const lines: string[] = [];
  lines.push("# Nightly Step Hotspots Summary");
  lines.push("");
  lines.push(`- Generated At: ${now.toISOString()}`);
  lines.push(`- Hotspot Report Generated At: ${String(report.generatedAt || "unknown")}`);
  lines.push(`- Overall: ${statusBadge(report.ok === true)}`);
  lines.push(`- Flagged Count: ${Number(report.flaggedCount ?? 0)}`);
  lines.push(`- Total Steps: ${Number(report.totalSteps ?? 0)}`);
  lines.push(`- Worst Step: ${worst ? worst.stepId : "-"}`);
  lines.push("");
  lines.push("| Step | Flagged | Fail % | Failing Streak | Slow Streak | Latest s | Spike | Reasons |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const hotspot of hotspots) {
    lines.push(
      `| ${hotspot.stepId} | ${hotspot.flagged ? "yes" : "no"} | ${Math.round(hotspot.failureRate * 100)} | ${hotspot.failingStreak} | ${hotspot.slowStreak} | ${Math.round((hotspot.latestDurationMs ?? 0) / 1000)} | ${Number(hotspot.durationSpikeRatio ?? 0).toFixed(2)} | ${hotspot.reasons.join(", ") || "-"} |`,
    );
  }
  lines.push("");

  const reportsDir = path.join(process.cwd(), "reports", "ops");
  fs.mkdirSync(reportsDir, { recursive: true });
  const timestamped = path.join(reportsDir, `nightly-step-hotspots-summary-${toTimestampForFile(now)}.md`);
  const latest = path.join(reportsDir, "nightly-step-hotspots-summary-latest.md");
  const markdown = `${lines.join("\n")}\n`;
  fs.writeFileSync(timestamped, markdown, "utf8");
  fs.writeFileSync(latest, markdown, "utf8");
  process.stdout.write(
    `${JSON.stringify({ ok: report.ok === true, reports: { timestamped, latest }, flaggedCount: report.flaggedCount }, null, 2)}\n`,
  );
}

main();
