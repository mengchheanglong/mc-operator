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
    "openclaw-to-discovery.md",
  );
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "openclaw-discovery-submission.schema.json",
  );
  const unifiedSchemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "discovery-submission-request.schema.json",
  );
  const scriptPath = path.join(root, "scripts", "submit-openclaw-discovery-candidate.ps1");
  const unifiedWriterPath = path.join(
    process.cwd(),
    "scripts",
    "submit-discovery-entry.ts",
  );
  const queuePath = path.join(directiveRoot, "discovery", "intake-queue.json");

  const issues: string[] = [];

  if (!fs.existsSync(contractPath)) issues.push("missing openclaw-to-discovery contract");
  if (!fs.existsSync(schemaPath)) issues.push("missing openclaw discovery submission schema");
  if (!fs.existsSync(unifiedSchemaPath)) issues.push("missing unified discovery submission schema");
  if (!fs.existsSync(scriptPath)) issues.push("missing OpenClaw submission script");
  if (!fs.existsSync(unifiedWriterPath)) issues.push("missing unified discovery submission writer");
  if (!fs.existsSync(queuePath)) issues.push("missing Discovery intake queue");

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const beforeQueue = fs.readFileSync(queuePath, "utf8");
  const tempPayloadPath = path.join(
    os.tmpdir(),
    `openclaw-discovery-submission-check-${Date.now()}.json`,
  );

  const payload = {
    candidate_id: "dryrun-openclaw-discovery-submission-check",
    candidate_name: "OpenClaw Discovery Submission Dry Run",
    source_type: "internal-signal",
    source_reference: "mission-control/scripts/check-openclaw-discovery-submission.ts",
    mission_alignment: "Discovery as operational front door",
    capability_gap_id: null,
    notes: "Dry-run verification only",
  };

  fs.writeFileSync(tempPayloadPath, JSON.stringify(payload, null, 2), "utf8");

  let dryRunJson: Record<string, unknown> | null = null;
  try {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-InputJsonPath",
        tempPayloadPath,
        "-DirectiveRoot",
        directiveRoot,
        "-QueuePath",
        queuePath,
        "-DryRun",
      ],
      { encoding: "utf8" },
    );
    dryRunJson = JSON.parse(output.trim()) as Record<string, unknown>;
  } catch (error) {
    issues.push(`dry-run invocation failed: ${String((error as Error).message || error)}`);
  } finally {
    if (fs.existsSync(tempPayloadPath)) fs.unlinkSync(tempPayloadPath);
  }

  const afterQueue = fs.readFileSync(queuePath, "utf8");
  if (beforeQueue !== afterQueue) {
    issues.push("dry-run mutated intake-queue.json");
  }

  if (!dryRunJson || dryRunJson.ok !== true) {
    issues.push("dry-run response did not return ok=true");
  } else {
    const entry = dryRunJson.entry as Record<string, unknown> | undefined;
    if (!entry) {
      issues.push("dry-run response missing entry preview");
    } else {
      if (entry.status !== "pending") issues.push("dry-run preview status must be pending");
      if (entry.routing_target !== null) issues.push("dry-run preview routing_target must be null");
      if (entry.capability_gap_id !== null) {
        issues.push("dry-run preview capability_gap_id must remain null without an active unresolved gap");
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
          unifiedSchemaExists: true,
          scriptExists: true,
          unifiedWriterExists: true,
          queueExists: true,
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
