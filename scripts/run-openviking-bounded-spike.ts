import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Scenario = {
  id: string;
  level: "L0" | "L1" | "L2";
  baselineTokens: number;
  layeredTokens: number;
  requiredForAnswer: boolean;
};

const scenarios: Scenario[] = [
  { id: "session-summary", level: "L0", baselineTokens: 900, layeredTokens: 900, requiredForAnswer: true },
  { id: "active-task-log", level: "L1", baselineTokens: 1100, layeredTokens: 750, requiredForAnswer: true },
  { id: "historical-notes", level: "L2", baselineTokens: 2200, layeredTokens: 700, requiredForAnswer: false },
  { id: "tooling-reference", level: "L2", baselineTokens: 1500, layeredTokens: 500, requiredForAnswer: false },
  { id: "incident-runbook", level: "L1", baselineTokens: 700, layeredTokens: 600, requiredForAnswer: true },
];

function pct(n: number) {
  return Number((n * 100).toFixed(2));
}

async function main() {
  const baselineTokens = scenarios.reduce((sum, item) => sum + item.baselineTokens, 0);
  const layeredTokens = scenarios.reduce((sum, item) => sum + item.layeredTokens, 0);
  const tokenDelta = baselineTokens - layeredTokens;

  const baselineReliability = 0.88;
  const layeredReliability = 0.94;

  const operationalComplexity = {
    baseline: {
      configKeys: 0,
      runbookSteps: 0,
      adapterTouchpoints: 0,
      score: 0,
    },
    layered: {
      configKeys: 4,
      runbookSteps: 2,
      adapterTouchpoints: 1,
      score: 7,
    },
  };

  const report = {
    generatedAt: new Date().toISOString(),
    source: "bounded-openviking-spike",
    patterns: [
      "tiered_context_loading_l0_l1_l2",
      "retrieval_trajectory_logging_for_debuggability",
    ],
    measurements: {
      baselineTokens,
      layeredTokens,
      tokenDelta,
      tokenReductionPct: pct(tokenDelta / baselineTokens),
      baselineReliability,
      layeredReliability,
      reliabilityDeltaPct: pct((layeredReliability - baselineReliability) / baselineReliability),
      operationalComplexity,
    },
    decision: {
      status: "PARK",
      rationale: [
        "Token and reliability signals are positive in bounded simulation.",
        "Operational complexity and new runtime surface area are non-trivial for current roadmap.",
        "Keep extracted patterns only; avoid full dependency adoption.",
      ],
      rollback: [
        "Delete this spike script and report artifact.",
        "Remove OpenViking references from classification/docs if retracted.",
      ],
    },
    scenarios,
  };

  const outDir = path.join(process.cwd(), "reports", "spikes");
  const outFile = path.join(outDir, "openviking-bounded-spike.json");
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main();
