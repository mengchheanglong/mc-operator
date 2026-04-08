import fs from "node:fs";
import path from "node:path";

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function statusBadge(ok: boolean) {
  return ok ? "PASS" : "FAIL";
}

function main() {
  const reportsDir = path.join(process.cwd(), "reports", "ops");
  const latestPath = path.join(reportsDir, "nightly-ops-bundle-latest.json");
  if (!fs.existsSync(latestPath)) {
    process.stderr.write(`Missing nightly bundle report: ${latestPath}\n`);
    process.exit(1);
  }

  const now = new Date();
  const payload = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
    generatedAt?: string;
    ok?: boolean;
    failedCount?: number;
    durationMs?: number;
    stepOrderVersion?: number;
    steps?: Array<{ id?: string; command?: string; ok?: boolean; exitCode?: number; durationMs?: number }>;
    stepTimeline?: Array<{ id?: string; startedOffsetMs?: number; finishedOffsetMs?: number }>;
  };
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const timelineMap = new Map(
    (Array.isArray(payload.stepTimeline) ? payload.stepTimeline : [])
      .map((item) => [String(item.id || ""), item]),
  );

  const lines: string[] = [];
  lines.push("# Nightly Ops Summary");
  lines.push("");
  lines.push(`- Generated At: ${now.toISOString()}`);
  lines.push(`- Bundle Generated At: ${String(payload.generatedAt || "unknown")}`);
  lines.push(`- Overall: ${statusBadge(Boolean(payload.ok))}`);
  lines.push(`- Failed Count: ${Number(payload.failedCount ?? 0)}`);
  lines.push(`- Duration (ms): ${Number(payload.durationMs ?? 0)}`);
  lines.push(`- Step Order Version: ${Number(payload.stepOrderVersion ?? 0)}`);
  lines.push("");
  lines.push("| Step | Status | Exit | Duration ms | Start offset ms | End offset ms |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: |");
  for (const step of steps) {
    const id = String(step.id || "unknown");
    const timeline = timelineMap.get(id) as
      | { startedOffsetMs?: number; finishedOffsetMs?: number }
      | undefined;
    lines.push(
      `| ${id} | ${statusBadge(Boolean(step.ok))} | ${Number(step.exitCode ?? 0)} | ${Number(step.durationMs ?? 0)} | ${Number(timeline?.startedOffsetMs ?? 0)} | ${Number(timeline?.finishedOffsetMs ?? 0)} |`,
    );
  }
  lines.push("");
  lines.push("## Raw Command Summary");
  for (const step of steps) {
    lines.push(`- ${String(step.id || "unknown")}: \`${String(step.command || "")}\``);
  }
  lines.push("");

  const markdown = `${lines.join("\n")}\n`;
  fs.mkdirSync(reportsDir, { recursive: true });
  const timestamped = path.join(reportsDir, `nightly-ops-summary-${toTimestampForFile(now)}.md`);
  const latestSummary = path.join(reportsDir, "nightly-ops-summary-latest.md");
  fs.writeFileSync(timestamped, markdown, "utf8");
  fs.writeFileSync(latestSummary, markdown, "utf8");
  process.stdout.write(
    `${JSON.stringify({ ok: true, reports: { timestamped, latest: latestSummary } }, null, 2)}\n`,
  );
}

main();
