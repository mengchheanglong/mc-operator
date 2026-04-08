import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { TOOL_ADMISSION_CATALOG } from "./tool-admission/catalog.ts";
import { scoreTool, summarize, type ToolAdmissionResult } from "./tool-admission/rubric.ts";

type AdmissionReport = {
  schemaVersion: string;
  generatedAt: string;
  summary: ReturnType<typeof summarize>;
  tools: ToolAdmissionResult[];
};

const REPORT_DIR = path.resolve(process.cwd(), "reports", "tool-admission");
const AGENT_LAB_ROOT = path.resolve(process.cwd(), "..", "agent-lab");
const CLASSIFICATION_DOC = path.join(AGENT_LAB_ROOT, "PROJECT_CLASSIFICATION.md");
const PARKED_MANIFEST_DOC = path.join(AGENT_LAB_ROOT, "tooling-parked", "MANIFEST.md");

function utcTimestampForFile(date: Date): string {
  const iso = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return iso;
}

function stableSortResults(results: ToolAdmissionResult[]) {
  return [...results].sort((a, b) => a.tool.localeCompare(b.tool));
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`;
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortObject(v)]));
  }
  return value;
}

function generatedClassificationBlock(report: AdmissionReport): string {
  const byStatus = {
    promote: report.tools.filter((t) => t.status === "promote"),
    park: report.tools.filter((t) => t.status === "park"),
    defer: report.tools.filter((t) => t.status === "defer"),
  };

  const formatRows = (rows: ToolAdmissionResult[]) =>
    rows
      .map(
        (row) =>
          `| \`${row.tool}\` | ${row.score} | ${row.reason} | ${row.nextAction} |`,
      )
      .join("\n") || "| _(none)_ | - | - | - |";

  return [
    "<!-- TOOL_ADMISSION:START -->",
    "## generated-tool-admission (deterministic)",
    "",
    `Generated from \`mission-control/reports/tool-admission/latest.json\` at ${report.generatedAt}.`,
    "",
    "### promote",
    "| Tool | Score | Reason | Next action |",
    "|---|---:|---|---|",
    formatRows(byStatus.promote),
    "",
    "### park",
    "| Tool | Score | Reason | Next action |",
    "|---|---:|---|---|",
    formatRows(byStatus.park),
    "",
    "### defer",
    "| Tool | Score | Reason | Next action |",
    "|---|---:|---|---|",
    formatRows(byStatus.defer),
    "<!-- TOOL_ADMISSION:END -->",
    "",
  ].join("\n");
}

function generatedParkedBlock(report: AdmissionReport): string {
  const parkedLike = report.tools.filter((t) => t.status !== "promote");
  const rows =
    parkedLike
      .map(
        (row) =>
          `| \`${row.tool}\` | ${row.status} | ${row.score} | ${row.reason} | ${row.nextAction} |`,
      )
      .join("\n") || "| _(none)_ | - | - | - | - |";

  return [
    "<!-- TOOL_ADMISSION:START -->",
    "## Generated admission state",
    "",
    `Source: \`../mission-control/reports/tool-admission/latest.json\` (${report.generatedAt})`,
    "",
    "| Tool | Status | Score | Reason | Next action |",
    "|---|---|---:|---|---|",
    rows,
    "<!-- TOOL_ADMISSION:END -->",
    "",
  ].join("\n");
}

function upsertGeneratedBlock(filePath: string, generatedBlock: string): void {
  const start = "<!-- TOOL_ADMISSION:START -->";
  const end = "<!-- TOOL_ADMISSION:END -->";

  const current = readFileSync(filePath, "utf8");
  const startIndex = current.indexOf(start);
  const endIndex = current.indexOf(end);

  if (startIndex >= 0 && endIndex > startIndex) {
    const afterEnd = endIndex + end.length;
    const updated = `${current.slice(0, startIndex)}${generatedBlock}${current.slice(afterEnd).replace(/^\s*/, "\n")}`;
    writeFileSync(filePath, updated, "utf8");
    return;
  }

  const separator = current.endsWith("\n") ? "\n" : "\n\n";
  writeFileSync(filePath, `${current}${separator}${generatedBlock}`, "utf8");
}

function run(): void {
  const tools = stableSortResults(TOOL_ADMISSION_CATALOG.map(scoreTool));
  const now = new Date();

  const report: AdmissionReport = {
    schemaVersion: "tool-admission.v1",
    generatedAt: now.toISOString(),
    summary: summarize(tools),
    tools,
  };

  mkdirSync(REPORT_DIR, { recursive: true });

  const latestPath = path.join(REPORT_DIR, "latest.json");
  const timestampedPath = path.join(REPORT_DIR, `tool-admission-${utcTimestampForFile(now)}.json`);

  const payload = stableStringify(report);
  writeFileSync(latestPath, payload, "utf8");
  writeFileSync(timestampedPath, payload, "utf8");

  upsertGeneratedBlock(CLASSIFICATION_DOC, generatedClassificationBlock(report));
  upsertGeneratedBlock(PARKED_MANIFEST_DOC, generatedParkedBlock(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        report: {
          latest: latestPath,
          timestamped: timestampedPath,
        },
        summary: report.summary,
      },
      null,
      2,
    )}\n`,
  );
}

run();
