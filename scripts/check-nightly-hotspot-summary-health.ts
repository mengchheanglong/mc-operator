import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const reportPath = path.join(process.cwd(), "reports", "ops", "nightly-step-hotspots-summary-latest.md");
  if (!existsSync(reportPath)) {
    process.stderr.write(`Missing nightly hotspot summary report: ${reportPath}\n`);
    process.exit(1);
  }

  const maxAgeHours = Math.max(1, Math.floor(envNum("MISSION_CONTROL_NIGHTLY_HOTSPOT_SUMMARY_MAX_AGE_HOURS", 30)));
  const stat = statSync(reportPath);
  const ageMs = Date.now() - stat.mtimeMs;
  const stale = ageMs > maxAgeHours * 60 * 60 * 1000;
  const content = readFileSync(reportPath, "utf8");
  const hasHeader = content.includes("# Nightly Step Hotspots Summary");
  const hasOverall = /- Overall:\s+(PASS|FAIL)/.test(content);
  const hasTable = content.includes("| Step | Flagged | Fail % | Failing Streak | Slow Streak | Latest s | Spike | Reasons |");
  const hasTotals = /- Flagged Count:\s+([0-9]+)/.test(content) && /- Total Steps:\s+([0-9]+)/.test(content);

  const ok = !stale && hasHeader && hasOverall && hasTable && hasTotals;
  const output = {
    ok,
    reportPath,
    stale,
    maxAgeHours,
    hasHeader,
    hasOverall,
    hasTable,
    hasTotals,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
