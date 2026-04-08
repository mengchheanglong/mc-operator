import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveDirectiveWorkspaceRoot } from "../src/server/paths/directive-workspace-root";

function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const directiveRoot = resolveDirectiveWorkspaceRoot();
  const contractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "openclaw-runtime-verification-signal.md",
  );
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "openclaw-runtime-verification-signal.schema.json",
  );
  const helperPath = path.join(root, "scripts", "submit-openclaw-runtime-verification-signal.ps1");
  const queuePath = path.join(directiveRoot, "discovery", "intake-queue.json");

  const issues: string[] = [];
  if (!fs.existsSync(contractPath)) issues.push("missing openclaw runtime verification signal contract");
  if (!fs.existsSync(schemaPath)) issues.push("missing openclaw runtime verification signal schema");
  if (!fs.existsSync(helperPath)) issues.push("missing OpenClaw runtime verification signal helper");

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-runtime-signal-check-"));
  const regressionPath = path.join(tempDir, "regression.json");
  const soakPath = path.join(tempDir, "soak.json");

  fs.writeFileSync(
    regressionPath,
    JSON.stringify({ endedAt: "2026-01-01T00:00:00.000Z", overallPass: true }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    soakPath,
    JSON.stringify({ finishedAt: "2026-01-01T00:00:00.000Z", status: "PASS" }, null, 2),
    "utf8",
  );

  let parsed: Record<string, unknown> | null = null;
  try {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperPath,
        "-RegressionReportPath",
        regressionPath,
        "-SoakSummaryPath",
        soakPath,
        "-CandidateId",
        "dryrun-openclaw-runtime-verification-signal-check",
        "-DirectiveRoot",
        directiveRoot,
        "-QueuePath",
        queuePath,
        "-DryRun",
      ],
      { encoding: "utf8" },
    );
    parsed = JSON.parse(output.trim()) as Record<string, unknown>;
  } catch (error) {
    issues.push(`runtime verification helper dry-run failed: ${String((error as Error).message || error)}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  if (!parsed || parsed.ok !== true) {
    issues.push("runtime verification dry-run did not return ok=true");
  } else {
    if (parsed.signal_detected !== true) {
      issues.push("runtime verification dry-run should detect stale signal");
    }
    if (parsed.submitted !== false) {
      issues.push("runtime verification dry-run should not submit");
    }
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
    if (reasons.length < 1) {
      issues.push("runtime verification dry-run should include stale reasons");
    }
    const submission = parsed.submission as Record<string, unknown> | undefined;
    const entry = submission?.entry as Record<string, unknown> | undefined;
    if (!entry) {
      issues.push("runtime verification dry-run missing submission entry preview");
    } else {
      if (entry.status !== "pending") issues.push("runtime verification entry preview status must be pending");
      if (entry.routing_target !== null) issues.push("runtime verification entry preview routing_target must be null");
      if (entry.capability_gap_id !== null) {
        issues.push("runtime verification entry preview capability_gap_id must remain null without an active unresolved gap");
      }
    }
  }

  const ok = issues.length === 0;
  console.log(
    JSON.stringify(
      {
        ok,
        metrics: {
          contractExists: true,
          schemaExists: true,
          helperExists: true,
          failedChecks: issues.length,
        },
        issues,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(1);
}

main();
