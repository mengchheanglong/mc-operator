import { existsSync, readFileSync } from "fs";
import path from "path";

type CanaryCheckRow = {
  id: string;
  command: string;
  critical: boolean;
  ok: boolean;
  exitCode: number;
};

type CanaryLatest = {
  generatedAt: string;
  ok: boolean;
  checks: CanaryCheckRow[];
  failedCriticalCount: number;
  guardrails?: { cooldownMinutes?: number; windowMinutes?: number };
};

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const reportPath = path.join(process.cwd(), "reports", "ops", "canary-latest.json");
  if (!existsSync(reportPath)) {
    process.stderr.write(`Missing canary report: ${reportPath}\n`);
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8")) as CanaryLatest;
  const maxAgeHours = Math.max(1, Math.floor(envNum("MISSION_CONTROL_CANARY_MAX_AGE_HOURS", 30)));
  const generatedAtMs = Date.parse(report.generatedAt);
  const ageMs = Date.now() - generatedAtMs;
  const stale = !Number.isFinite(generatedAtMs) || ageMs > maxAgeHours * 60 * 60 * 1000;

  const failedChecks = (report.checks || []).filter((check) => check.critical && !check.ok);
  const ok = !stale && report.ok === true && failedChecks.length === 0;

  const output = {
    ok,
    reportPath,
    generatedAt: report.generatedAt,
    stale,
    maxAgeHours,
    failedCriticalCount: failedChecks.length,
    checks: (report.checks || []).map((check) => ({
      id: check.id,
      command: check.command,
      critical: check.critical,
      ok: check.ok,
      exitCode: check.exitCode,
    })),
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
