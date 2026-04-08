import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

type EvalSummary = {
  generatedAt: string;
  command: string;
  total: number;
  passed: number;
  failed: number;
  failureRate: number;
  score: number;
  costUsd: number;
  rawOutputPath: string;
};

function toNum(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractSummary(raw: any): Omit<EvalSummary, "generatedAt" | "command" | "rawOutputPath"> {
  const rootResults = raw?.results;
  const results = Array.isArray(rootResults)
    ? rootResults
    : Array.isArray(rootResults?.results)
      ? rootResults.results
      : [];
  const stats = raw?.stats || rootResults?.stats || {};

  const totalFromResults = results.length;
  const total = totalFromResults || toNum(stats?.tests, 0) || toNum(stats?.totalTests, 0);

  let passed = 0;
  let failed = 0;

  if (results.length > 0) {
    for (const row of results) {
      const success = Boolean(row?.success ?? row?.pass);
      if (success) passed += 1;
      else failed += 1;
    }
  } else {
    passed = toNum(stats?.successes, 0) || toNum(stats?.passed, 0);
    failed = toNum(stats?.failures, 0) || toNum(stats?.failed, 0);
  }

  if (total > 0 && passed + failed === 0) {
    passed = toNum(stats?.successes, Math.max(0, total));
    failed = Math.max(0, total - passed);
  }

  const failureRate = total > 0 ? failed / total : 1;
  const score = total > 0 ? passed / total : 0;
  const costUsd =
    toNum(stats?.cost, NaN) ||
    toNum(stats?.totalCost, NaN) ||
    toNum(raw?.resultsSummary?.cost, NaN) ||
    0;

  return {
    total,
    passed,
    failed,
    failureRate: Number(failureRate.toFixed(3)),
    score: Number(score.toFixed(3)),
    costUsd: Number(costUsd.toFixed(6)),
  };
}

function main() {
  const outDir = path.join(process.cwd(), "reports", "evals");
  mkdirSync(outDir, { recursive: true });

  const rawOutputPath = path.join(outDir, "promptfoo-raw.json");
  const latestPath = path.join(outDir, "latest.json");
  const summaryMdPath = path.join(outDir, "latest-summary.md");
  const timestampTag = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const historicalPath = path.join(outDir, `eval-${timestampTag}.json`);

  const command = `npx promptfoo eval -c evals/promptfoo.agent-evals.yaml -o ${rawOutputPath}`;
  const run = spawnSync("npx", ["promptfoo", "eval", "-c", "evals/promptfoo.agent-evals.yaml", "-o", rawOutputPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (!existsSync(rawOutputPath)) {
    process.stderr.write((run.stdout || "") + (run.stderr || ""));

    process.stderr.write(`Promptfoo output not found: ${rawOutputPath}\n`);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(rawOutputPath, "utf8"));
  const metrics = extractSummary(raw);
  const latest: EvalSummary = {
    generatedAt: new Date().toISOString(),
    command,
    rawOutputPath,
    ...metrics,
  };

  writeFileSync(latestPath, `${JSON.stringify(latest, null, 2)}\n`, "utf8");
  writeFileSync(historicalPath, `${JSON.stringify(latest, null, 2)}\n`, "utf8");

  const md = [
    "# Agent Eval Summary",
    "",
    `- Generated: ${latest.generatedAt}`,
    `- Total: ${latest.total}`,
    `- Passed: ${latest.passed}`,
    `- Failed: ${latest.failed}`,
    `- Score: ${latest.score}`,
    `- Failure rate: ${latest.failureRate}`,
    `- Cost USD: ${latest.costUsd}`,
    `- Raw output: ${latest.rawOutputPath}`,
  ].join("\n");

  writeFileSync(summaryMdPath, `${md}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(latest, null, 2)}\n`);
}

main();
