import { existsSync, readFileSync } from "fs";
import path from "path";

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}

function main() {
  const lastN = Number.parseInt(process.argv[2] || "20", 10) || 20;
  const telemetryPath = path.join(process.cwd(), "reports", "codegraph-spike-artifacts", "telemetry.jsonl");

  if (!existsSync(telemetryPath)) {
    process.stdout.write(`${JSON.stringify({ total: 0, message: "telemetry file not found" }, null, 2)}\n`);
    return;
  }

  const rows = readFileSync(telemetryPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) as any; } catch { return null; }
    })
    .filter(Boolean)
    .slice(-lastN);

  const qualityCounts = { fresh: 0, stale: 0, degraded: 0 };
  let injected = 0;
  let indexSuccess = 0;

  for (const row of rows) {
    if (row.graphBlockInjected) injected += 1;
    if (row.indexSuccess) indexSuccess += 1;
    if (row.qualityState && row.qualityState in qualityCounts) {
      qualityCounts[row.qualityState as keyof typeof qualityCounts] += 1;
    }
  }

  const summary = {
    total: rows.length,
    lastN,
    injectionRate: rows.length ? Number((injected / rows.length).toFixed(3)) : 0,
    indexSuccessRate: rows.length ? Number((indexSuccess / rows.length).toFixed(3)) : 0,
    qualityCounts,
    avg: {
      baselineChars: mean(rows.map((r) => Number(r.baselineChars || 0))),
      baselineTokens: mean(rows.map((r) => Number(r.baselineTokens || 0))),
      withGraphChars: mean(rows.map((r) => Number(r.withGraphChars || 0))),
      withGraphTokens: mean(rows.map((r) => Number(r.withGraphTokens || 0))),
      deltaChars: mean(rows.map((r) => Number(r.deltaChars || 0))),
      deltaTokens: mean(rows.map((r) => Number(r.deltaTokens || 0))),
    },
    recent: rows.slice(-5),
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main();
