import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const directiveRoot = path.join(root, "workspace", "directive-workspace");
  const contractPath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "decision-record.md",
  );
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "discovery-completion-record-request.schema.json",
  );
  const scriptPath = path.join(process.cwd(), "scripts", "write-discovery-completion-record.ts");
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  if (!fs.existsSync(contractPath)) issues.push("missing decision record template");
  if (!fs.existsSync(schemaPath)) issues.push("missing discovery completion record schema");
  if (!fs.existsSync(scriptPath)) issues.push("missing discovery completion record writer");
  if (!fs.existsSync(tsxPath)) issues.push("missing tsx runner");

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-completion-record-writer-"));
  const tempDirectiveRoot = path.join(tempDir, "directive-workspace");
  const queuePath = path.join(tempDirectiveRoot, "discovery", "intake-queue.json");
  const requestPath = path.join(tempDir, "completion-record-request.json");
  const intakePath = path.join(
    tempDirectiveRoot,
    "discovery",
    "intake",
    "2026-03-22-dry-run-completion-intake.md",
  );
  const routingPath = path.join(
    tempDirectiveRoot,
    "discovery",
    "routing-log",
    "2026-03-22-dry-run-completion-routing.md",
  );
  const completionPath = path.join(
    tempDirectiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-22-dry-run-completion-record.md",
  );

  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.mkdirSync(path.dirname(intakePath), { recursive: true });
  fs.mkdirSync(path.dirname(routingPath), { recursive: true });
  fs.writeFileSync(intakePath, "# dry run intake\n", "utf8");
  fs.writeFileSync(routingPath, "# dry run routing\n", "utf8");

  const queue = {
    status: "primary",
    updatedAt: "2026-03-22",
    entries: [
      {
        candidate_id: "dryrun-discovery-completion-record-check",
        candidate_name: "Dry Run Discovery Completion Record Check",
        source_type: "internal-signal",
        source_reference: "mission-control/scripts/check-discovery-completion-record-writer.ts",
        received_at: "2026-03-22",
        status: "routed",
        routing_target: "architecture",
        mission_alignment: "Discovery as operational front door",
        capability_gap_id: "gap-discovery-front-door-coverage",
        assigned_worker: null,
        intake_record_path: "discovery/intake/2026-03-22-dry-run-completion-intake.md",
        fast_path_record_path: null,
        routing_record_path: "discovery/routing-log/2026-03-22-dry-run-completion-routing.md",
        routed_at: "2026-03-22",
        completed_at: null,
        result_record_path: null,
        notes: "dry run seed"
      }
    ]
  };

  const request = {
    candidate_id: "dryrun-discovery-completion-record-check",
    candidate_name: "Dry Run Discovery Completion Record Check",
    decision_date: "2026-03-22",
    decision_state: "adopt",
    adoption_target: "reusable internal operating logic",
    route_destination: "architecture",
    rationale: "This candidate closes the final Discovery completion-link gap.",
    evidence_path: "architecture/03-adopted/2026-03-22-dry-run-completion-record.md",
    validation_method: "Dry-run writer plus queue lifecycle sync validation.",
    rollback_note: "Delete the generated completion record and revert the queue entry.",
    linked_intake_record: "discovery/intake/2026-03-22-dry-run-completion-intake.md",
    linked_routing_record: "discovery/routing-log/2026-03-22-dry-run-completion-routing.md",
    output_relative_path: "architecture/03-adopted/2026-03-22-dry-run-completion-record.md"
  };

  writeJson(queuePath, queue);
  writeJson(requestPath, request);

  try {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `& '${tsxPath}' '${scriptPath}' --input-json-path '${requestPath}' --queue-path '${queuePath}' --directive-root '${tempDirectiveRoot}'`,
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    issues.push(
      `discovery completion record writer failed: ${String((error as Error).message || error)}`,
    );
  }

  const updatedQueue = JSON.parse(fs.readFileSync(queuePath, "utf8")) as {
    entries: Array<Record<string, unknown>>;
  };
  const entry = updatedQueue.entries[0];
  const completionExists = fs.existsSync(completionPath);
  const completionContent = completionExists
    ? fs.readFileSync(completionPath, "utf8")
    : "";
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (!completionExists) {
    issues.push("completion record file was not created");
  }
  if (!completionContent.includes("Decision state: adopt")) {
    issues.push("completion record content missing decision state");
  }
  if (entry.status !== "completed") {
    issues.push("queue entry was not moved to completed");
  }
  if (entry.result_record_path !== request.output_relative_path) {
    issues.push("queue entry missing result_record_path");
  }
  if (entry.routing_record_path !== request.linked_routing_record) {
    issues.push("queue entry routing_record_path mismatch");
  }
  if (entry.intake_record_path !== request.linked_intake_record) {
    issues.push("queue entry intake_record_path mismatch");
  }

  const ok = issues.length === 0;
  console.log(
    JSON.stringify(
      {
        ok,
        metrics: {
          contractExists: true,
          schemaExists: true,
          writerExists: true,
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
