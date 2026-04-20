import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, openSync, closeSync, unlinkSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

type CodegraphSummary = {
  markdown?: string;
  markdownChars?: number;
  markdownTokensEstimated?: number;
  statsPreview?: string[];
  indexed?: boolean;
  indexedRepositoryCount?: number;
  usedCommands?: { command: string; ok: boolean }[];
  failures?: { command: string; output: string }[];
  sections?: {
    changeImpact?: string[];
    callChains?: string[];
    hotspots?: string[];
    verificationTargets?: string[];
  };
  metadata?: {
    generatedAt?: string;
    sourceMode?: "full" | "refresh" | "fallback";
    qualityState?: "fresh" | "stale" | "degraded";
    failureReason?: string;
    failureClass?: string;
    reasonCode?: string;
    retryCount?: number;
    indexSucceeded?: boolean;
    indexedThisRun?: boolean;
    indexAgeMinutes?: number;
  };
};

function estimateTokens(value: string) {
  return Math.ceil((value || "").length / 4);
}

function toBriefMetrics(markdown: string) {
  return { chars: markdown.length, tokensEstimated: estimateTokens(markdown) };
}

function stripBoundedSection(markdown: string) {
  const heading = "### codegraph_summary (bounded)";
  const start = markdown.indexOf(heading);
  if (start < 0) return markdown.trimEnd();

  const before = markdown.slice(0, start).trimEnd();
  const rest = markdown.slice(start + heading.length);
  const nextHeadingMatch = rest.match(/\n##\s+/);
  if (!nextHeadingMatch || nextHeadingMatch.index === undefined) return before;

  const after = rest.slice(nextHeadingMatch.index + 1).trimStart();
  return `${before}\n\n${after}`.trimEnd();
}

function ensureCodegraphSummary(repoRoot: string, projectPath: string, outJsonPath: string) {
  const adapterPath = path.join(repoRoot, "scripts", "codegraph-summary.mjs");
  const run = spawnSync(
    process.execPath,
    [
      adapterPath,
      "--repo",
      projectPath,
      "--out-json",
      outJsonPath,
      "--out-md",
      outJsonPath.replace(/\.json$/i, ".md"),
      "--index-mode",
      process.env.MISSION_CONTROL_CODEGRAPH_INDEX_MODE || "refresh",
      "--index-timeout-ms",
      process.env.MISSION_CONTROL_CODEGRAPH_INDEX_TIMEOUT_MS || "120000",
      "--index-retries",
      process.env.MISSION_CONTROL_CODEGRAPH_INDEX_RETRIES || "2",
      "--retry-backoff-ms",
      process.env.MISSION_CONTROL_CODEGRAPH_RETRY_BACKOFF_MS || "1200",
      "--stale-cache-ttl-minutes",
      process.env.MISSION_CONTROL_CODEGRAPH_STALE_CACHE_TTL_MINUTES || "180",
    ],
    { cwd: projectPath, encoding: "utf8", env: { ...process.env } },
  );

  if (run.status !== 0) {
    throw new Error(`codegraph adapter failed (${run.status}): ${(run.stderr || run.stdout || "").trim()}`);
  }

  return JSON.parse(readFileSync(outJsonPath, "utf8")) as CodegraphSummary;
}

function hasHighSignal(summary: CodegraphSummary) {
  const sections = summary.sections || {};
  return [sections.changeImpact, sections.callChains, sections.hotspots, sections.verificationTargets].some(
    (section) => Array.isArray(section) && section.length > 0,
  );
}

function withSingleFlightLock<T>(lockPath: string, run: () => T): T {
  let fd: number | null = null;
  try {
    fd = openSync(lockPath, "wx");
  } catch {
    throw new Error(`codegraph spike already running (single-flight lock): ${lockPath}`);
  }

  try {
    return run();
  } finally {
    if (fd !== null) closeSync(fd);
    try { unlinkSync(lockPath); } catch {}
  }
}

function aggregateTelemetry(telemetryPath: string, lastN = 20) {
  if (!existsSync(telemetryPath)) {
    return { total: 0, injected: 0, byQuality: { fresh: 0, stale: 0, degraded: 0 } };
  }

  const rows = readFileSync(telemetryPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) as any; } catch { return null; }
    })
    .filter(Boolean)
    .slice(-lastN);

  const byQuality = { fresh: 0, stale: 0, degraded: 0 };
  let injected = 0;
  for (const row of rows) {
    if (row.graphBlockInjected) injected += 1;
    if (row.qualityState && row.qualityState in byQuality) {
      byQuality[row.qualityState as keyof typeof byQuality] += 1;
    }
  }

  return { total: rows.length, injected, byQuality };
}

function main() {
  const projectId = process.argv[2] || "mc-operator";
  const projectPath = process.cwd();
  const workspaceRoot = path.resolve(projectPath, "..");

  const strictGateMode = (process.env.MISSION_CONTROL_CODEGRAPH_STRICT_GATE_MODE || "true").toLowerCase() !== "false";
  const boundedMode = (process.env.MISSION_CONTROL_CODEGRAPH_BOUNDED_MODE || "true").toLowerCase() !== "false";
  const fallbackMode = (process.env.MISSION_CONTROL_CODEGRAPH_FALLBACK_MODE || "true").toLowerCase() !== "false";
  const diagnosticsMode = (process.env.MISSION_CONTROL_CODEGRAPH_DIAGNOSTICS_MODE || "false").toLowerCase() === "true";
  const tokenDeltaBudget = Number.parseInt(process.env.MISSION_CONTROL_CODEGRAPH_TOKEN_DELTA_BUDGET || "225", 10) || 225;

  const outDir = path.join(projectPath, "reports", "codegraph-spike-artifacts");
  mkdirSync(outDir, { recursive: true });
  const lockPath = path.join(outDir, "spike-run.lock");

  withSingleFlightLock(lockPath, () => {
    const promptPackPath = path.join(projectPath, ".openclaw", "context", "PROMPT_PACK.md");
    const promptPackRaw = readFileSync(promptPackPath, "utf8");
    const promptPackBase = stripBoundedSection(promptPackRaw);

    const summaryPath = path.join(projectPath, ".openclaw", "context", "codegraph-summary.json");
    const summary = ensureCodegraphSummary(workspaceRoot, projectPath, summaryPath);
    const summaryMarkdown = (summary.markdown || "").trim();

    const baselineMetrics = toBriefMetrics(promptPackBase);
    const withSummaryMarkdown = [
      promptPackBase,
      "",
      "### codegraph_summary (bounded)",
      summaryMarkdown,
      `- Budget: ${Number(summary.markdownChars || 0)}/900 chars`,
      `- Estimated tokens: ${Number(summary.markdownTokensEstimated || estimateTokens(summaryMarkdown))}/225`,
    ].join("\n").trimEnd();
    const withCodegraphMetrics = toBriefMetrics(withSummaryMarkdown);
    const delta = {
      chars: withCodegraphMetrics.chars - baselineMetrics.chars,
      tokensEstimated: withCodegraphMetrics.tokensEstimated - baselineMetrics.tokensEstimated,
    };

    let qualityState = summary.metadata?.qualityState || "degraded";
    const highSignal = hasHighSignal(summary);
    const qualityAllowed = qualityState === "fresh" || qualityState === "stale";
    const withinBudget = delta.tokensEstimated <= tokenDeltaBudget;

    let injected = true;
    let gateReasonCode = "gate_pass";

    if (!boundedMode) {
      injected = false;
      gateReasonCode = "bounded_mode_disabled";
    } else if (!qualityAllowed || (strictGateMode && qualityState !== "fresh")) {
      injected = false;
      gateReasonCode = "quality_gate_failed";
    } else if (!withinBudget) {
      injected = false;
      gateReasonCode = "token_delta_budget_exceeded";
    } else if (!highSignal) {
      injected = false;
      gateReasonCode = "empty_high_signal_sections";
    } else if (!fallbackMode && summary.metadata?.sourceMode === "fallback") {
      injected = false;
      gateReasonCode = "fallback_mode_disabled";
    }

    const strictFreshGatePassed = Boolean(summary.metadata?.indexSucceeded) && Boolean(summary.metadata?.indexedThisRun) && injected;
    if (qualityState === "fresh" && !strictFreshGatePassed) {
      qualityState = "stale";
      if (gateReasonCode === "gate_pass") {
        gateReasonCode = "fresh_gate_blocked";
      }
    }

    const output = {
      generatedAt: new Date().toISOString(),
      projectId,
      projectPath,
      flags: { boundedMode, strictGateMode, fallbackMode, diagnosticsMode, tokenDeltaBudget },
      baseline: { ...baselineMetrics, hasCodegraphSummary: false },
      withCodegraph: { ...withCodegraphMetrics, hasCodegraphSummary: summaryMarkdown.length > 0 },
      delta,
      gate: {
        injected,
        reasonCode: gateReasonCode,
        qualityAllowed,
        highSignal,
        withinBudget,
      },
      metadata: {
        generatedAt: summary.metadata?.generatedAt || "",
        sourceMode: summary.metadata?.sourceMode || "refresh",
        qualityState,
        failureReason: summary.metadata?.failureReason || "",
        failureClass: summary.metadata?.failureClass || "none",
        reasonCode: summary.metadata?.reasonCode || "none",
        retryCount: Number(summary.metadata?.retryCount || 0),
        indexSucceeded: Boolean(summary.metadata?.indexSucceeded),
        indexedThisRun: Boolean(summary.metadata?.indexedThisRun),
        indexAgeMinutes: Number(summary.metadata?.indexAgeMinutes || 0),
      },
      codegraphSummaryBudget: {
        chars: Number(summary.markdownChars || summaryMarkdown.length),
        maxChars: 900,
        tokensEstimated: Number(summary.markdownTokensEstimated || estimateTokens(summaryMarkdown)),
        maxTokens: 225,
      },
      codegraphSummaryCompact: {
        indexed: Boolean(summary.indexed),
        indexedRepositoryCount: Number(summary.indexedRepositoryCount || 0),
        statsPreview: Array.isArray(summary.statsPreview) ? summary.statsPreview : [],
        sections: summary.sections || {},
        usedCommands: Array.isArray(summary.usedCommands) ? summary.usedCommands : [],
        failures: Array.isArray(summary.failures) ? summary.failures : [],
      },
      preview: {
        baselineHead: promptPackBase.split("\n").slice(0, 18),
        withCodegraphHead: withSummaryMarkdown.split("\n").slice(0, 24),
      },
    };

    const outPath = path.join(outDir, "metrics.json");
    writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

    const telemetryPath = path.join(outDir, "telemetry.jsonl");
    const telemetryRow = {
      ts: output.generatedAt,
      baselineChars: output.baseline.chars,
      baselineTokens: output.baseline.tokensEstimated,
      withGraphChars: output.withCodegraph.chars,
      withGraphTokens: output.withCodegraph.tokensEstimated,
      deltaChars: output.delta.chars,
      deltaTokens: output.delta.tokensEstimated,
      qualityState: output.metadata.qualityState,
      indexSuccess: Boolean(output.metadata.indexSucceeded),
      graphBlockInjected: output.gate.injected,
      gateReasonCode: output.gate.reasonCode,
      failureClass: output.metadata.failureClass,
      retryCount: output.metadata.retryCount,
      workflowOutcome: process.env.MISSION_CONTROL_WORKFLOW_OUTCOME || "unknown",
    };
    appendFileSync(telemetryPath, `${JSON.stringify(telemetryRow)}\n`, "utf8");

    const aggregate = aggregateTelemetry(telemetryPath, 20);
    writeFileSync(path.join(outDir, "telemetry-summary.json"), `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  });
}

main();
