import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type WorkspaceHealthLatest = {
  generatedAt: string;
  ok: boolean;
  summary?: {
    runtimeChecks?: { total?: number; passed?: number };
    projects?: { total?: number; healthy?: number };
  };
};

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const reportPath = path.join(process.cwd(), "reports", "ops", "workspace-global-health-latest.json");
  if (!existsSync(reportPath)) {
    process.stderr.write(`Missing workspace global health report: ${reportPath}\n`);
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8")) as WorkspaceHealthLatest;
  const maxAgeHours = Math.max(1, Math.floor(envNum("MISSION_CONTROL_WORKSPACE_HEALTH_MAX_AGE_HOURS", 30)));
  const generatedAtMs = Date.parse(report.generatedAt);
  const ageMs = Date.now() - generatedAtMs;
  const stale = !Number.isFinite(generatedAtMs) || ageMs > maxAgeHours * 60 * 60 * 1000;

  const runtimeTotal = Number(report.summary?.runtimeChecks?.total ?? 0);
  const runtimePassed = Number(report.summary?.runtimeChecks?.passed ?? 0);
  const projectTotal = Number(report.summary?.projects?.total ?? 0);
  const projectHealthy = Number(report.summary?.projects?.healthy ?? 0);

  const ok = !stale
    && report.ok === true
    && runtimeTotal > 0
    && runtimePassed === runtimeTotal
    && projectTotal > 0
    && projectHealthy === projectTotal;

  const output = {
    ok,
    reportPath,
    generatedAt: report.generatedAt,
    stale,
    maxAgeHours,
    runtimeChecks: { total: runtimeTotal, passed: runtimePassed },
    projects: { total: projectTotal, healthy: projectHealthy },
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
