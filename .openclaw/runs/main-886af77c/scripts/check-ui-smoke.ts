import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

interface SmokeIssue {
  source: "console" | "page" | "network";
  message: string;
}

interface FlowResult {
  id: string;
  path: string;
  status: "pass" | "fail";
  durationMs: number;
  screenshot: string;
  issues: SmokeIssue[];
  error: string | null;
}

interface SmokeReport {
  suite: string;
  ok: boolean;
  generatedAt: string;
  baseUrl: string;
  viewport: { width: number; height: number };
  flows: FlowResult[];
  totals: { passed: number; failed: number };
}

async function main() {
  const reportPath = path.join(process.cwd(), "reports", "ui-smoke", "latest.json");
  const raw = await readFile(reportPath, "utf8");
  const report = JSON.parse(raw) as SmokeReport;

  if (report.suite !== "ui-smoke") {
    throw new Error("Invalid smoke report format: suite mismatch");
  }

  const failedFlows = report.flows.filter((flow) => flow.status !== "pass");
  const hasIssueLeaks = report.flows.some((flow) => flow.issues.length > 0);
  const missingScreenshots = report.flows.filter((flow) => !flow.screenshot);

  if (!report.ok || failedFlows.length > 0 || hasIssueLeaks || missingScreenshots.length > 0) {
    console.error("UI smoke check failed.");
    console.error(`Generated: ${report.generatedAt}`);
    console.error(`Base URL: ${report.baseUrl}`);
    for (const flow of report.flows) {
      const issueCount = flow.issues.length;
      const status = flow.status.toUpperCase();
      console.error(`- ${flow.id} [${status}] issues=${issueCount} screenshot=${flow.screenshot || "(missing)"}`);
      if (flow.error) {
        console.error(`  error: ${flow.error}`);
      }
      for (const issue of flow.issues.slice(0, 10)) {
        console.error(`  ${issue.source}: ${issue.message}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log("UI smoke check passed.");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Flows: ${report.flows.length} (passed=${report.totals.passed}, failed=${report.totals.failed})`);
}

void main().catch((err) => {
  console.error("UI smoke check failed to read report.");
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
