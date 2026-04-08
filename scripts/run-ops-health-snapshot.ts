import fs from "node:fs";
import path from "node:path";
import { readOpsHealthSnapshot } from "../src/server/services/ops-health-service.ts";

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function main() {
  const now = new Date();
  const snapshot = readOpsHealthSnapshot(process.cwd(), { maxAgeHours: 30 });
  const payload = {
    generatedAt: now.toISOString(),
    ok: snapshot.overallOk === true,
    ...snapshot,
  };

  const reportsDir = path.join(process.cwd(), "reports", "ops");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = toTimestampForFile(now);
  const timestamped = path.join(reportsDir, `ops-health-${stamp}.json`);
  const latest = path.join(reportsDir, "ops-health-latest.json");
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(timestamped, serialized, "utf8");
  fs.writeFileSync(latest, serialized, "utf8");

  process.stdout.write(`${JSON.stringify({ ok: payload.ok, reports: { timestamped, latest } }, null, 2)}\n`);
  if (!payload.ok) process.exit(1);
}

main();
