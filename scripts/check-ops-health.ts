import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type OpsHealthItem = {
  key: string;
  label: string;
  available: boolean;
  ok: boolean | null;
  stale: boolean;
  generatedAt: string | null;
  detail: string;
};

type OpsHealthLatest = {
  generatedAt: string;
  overallOk: boolean | null;
  items: Record<string, OpsHealthItem>;
};

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const reportPath = path.join(process.cwd(), "reports", "ops", "ops-health-latest.json");
  if (!existsSync(reportPath)) {
    process.stderr.write(`Missing ops health report: ${reportPath}\n`);
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8")) as OpsHealthLatest;
  const maxAgeHours = Math.max(1, Math.floor(envNum("MISSION_CONTROL_OPS_HEALTH_MAX_AGE_HOURS", 30)));
  const generatedAtMs = Date.parse(report.generatedAt);
  const ageMs = Date.now() - generatedAtMs;
  const stale = !Number.isFinite(generatedAtMs) || ageMs > maxAgeHours * 60 * 60 * 1000;

  const expectedKeys = ["repoSources", "canary", "workspaceHealth", "nightlyBundle"];
  const items = report.items || {};
  const missingKeys = expectedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(items, key));
  const failingKeys = Object.values(items)
    .filter((item) => !(item.available && item.ok === true && item.stale === false))
    .map((item) => item.key);

  const ok = !stale
    && report.overallOk === true
    && missingKeys.length === 0
    && failingKeys.length === 0;

  const output = {
    ok,
    reportPath,
    generatedAt: report.generatedAt,
    stale,
    maxAgeHours,
    overallOk: report.overallOk,
    missingKeys,
    failingKeys,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
