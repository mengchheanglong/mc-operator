import assert from "assert";
import { readFileSync, existsSync } from "fs";
import path from "path";

const servicePath = new URL("../src/server/services/context-pack-service.ts", import.meta.url);
const writerPath = new URL("../src/server/services/workspace-context-writer.ts", import.meta.url);
const summaryServicePath = new URL("../src/server/services/codegraph-summary-service.ts", import.meta.url);
const runSpikePath = new URL("./run-codegraph-spike.ts", import.meta.url);

const serviceContent = readFileSync(servicePath, "utf8");
const writerContent = readFileSync(writerPath, "utf8");
const summaryServiceContent = readFileSync(summaryServicePath, "utf8");
const runSpikeContent = readFileSync(runSpikePath, "utf8");

assert.match(serviceContent, /collectBoundedCodegraphSummary/, "Context pack service should wire bounded codegraph summary collection.");
assert.match(serviceContent, /codegraph_summary_diagnostics/, "Context pack service should expose codegraph diagnostics.");
assert.match(summaryServiceContent, /isCodegraphStrictGateModeEnabled/, "Summary service should provide strict gate mode flag.");
assert.match(summaryServiceContent, /reasonCode/, "Summary service should return omit reason code for failed gate.");
assert.match(writerContent, /codegraph_summary \(bounded\)/, "Markdown renderer should expose bounded codegraph summary block.");
assert.match(runSpikeContent, /stripBoundedSection/, "Spike runner should remove existing bounded section before recomputing metrics.");
assert.match(runSpikeContent, /telemetry\.jsonl/, "Spike runner should append telemetry log.");

const summaryPath = path.join(process.cwd(), ".openclaw", "context", "codegraph-summary.json");
assert.ok(existsSync(summaryPath), "Summary artifact should exist after spike run.");

const parsed = JSON.parse(readFileSync(summaryPath, "utf8")) as {
  markdown?: string;
  markdownChars?: number;
  statsPreview?: unknown[];
  sections?: Record<string, unknown>;
  metadata?: {
    generatedAt?: string;
    sourceMode?: string;
    qualityState?: string;
    failureReason?: string;
    indexAgeMinutes?: number;
  };
};

assert.ok(typeof parsed.markdown === "string" && parsed.markdown.length > 0, "Adapter should emit markdown summary.");
assert.ok(Number(parsed.markdownChars || 0) <= 900, "Adapter markdown should respect max-markdown-chars budget.");
assert.ok(Array.isArray(parsed.statsPreview), "Adapter should emit statsPreview array.");
assert.ok(parsed.sections && typeof parsed.sections === "object", "Adapter should emit high-signal sections.");
for (const key of ["changeImpact", "callChains", "hotspots", "verificationTargets"]) {
  const lines = Array.isArray((parsed.sections as any)[key]) ? (parsed.sections as any)[key] : [];
  assert.ok(lines.length <= 3, `Section ${key} should stay bounded (<=3).`);
}

assert.ok(parsed.metadata?.generatedAt, "metadata.generatedAt is required.");
assert.ok(["full", "refresh", "fallback"].includes(String(parsed.metadata?.sourceMode || "")), "metadata.sourceMode should be full|refresh|fallback.");
assert.ok(["fresh", "stale", "degraded"].includes(String(parsed.metadata?.qualityState || "")), "metadata.qualityState should be fresh|stale|degraded.");
assert.ok(typeof parsed.metadata?.failureReason === "string", "metadata.failureReason should be present.");
assert.ok(Number.isFinite(Number(parsed.metadata?.indexAgeMinutes ?? NaN)), "metadata.indexAgeMinutes should be numeric.");

const telemetryPath = path.join(process.cwd(), "reports", "codegraph-spike-artifacts", "telemetry.jsonl");
assert.ok(existsSync(telemetryPath), "Telemetry log should exist.");
const telemetryLines = readFileSync(telemetryPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
assert.ok(telemetryLines.length > 0, "Telemetry should include at least one run.");
const latestTelemetry = JSON.parse(telemetryLines[telemetryLines.length - 1]);
assert.ok(typeof latestTelemetry.graphBlockInjected === "boolean", "Telemetry should include graphBlockInjected.");
assert.ok(typeof latestTelemetry.deltaTokens === "number", "Telemetry should include delta tokens.");

console.log("codegraph spike check: PASS");
