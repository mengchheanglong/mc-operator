import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const directiveRoot = path.join(root, "workspace", "directive-workspace");
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "discovery-case-record-request.schema.json",
  );
  const scriptPath = path.join(process.cwd(), "scripts", "write-discovery-case-records.ts");
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  if (!fs.existsSync(schemaPath)) issues.push("missing discovery case record schema");
  if (!fs.existsSync(scriptPath)) issues.push("missing discovery case record writer");
  if (!fs.existsSync(tsxPath)) issues.push("missing tsx runner");

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-case-record-writer-"));
  const tempDirectiveRoot = path.join(tempDir, "directive-workspace");
  const queuePath = path.join(tempDirectiveRoot, "discovery", "intake-queue.json");
  const requestPath = path.join(tempDir, "case-record-request.json");

  const queue = {
    status: "primary",
    updatedAt: "2026-03-22",
    entries: [
      {
        candidate_id: "dryrun-discovery-case-record-check",
        candidate_name: "Dry Run Discovery Case Record Check",
        source_type: "internal-signal",
        source_reference: "mission-control/scripts/check-discovery-case-record-writer.ts",
        received_at: "2026-03-22",
        status: "pending",
        routing_target: null,
        mission_alignment: "Discovery as operational front door",
        capability_gap_id: "gap-discovery-front-door-coverage",
        assigned_worker: null,
        intake_record_path: null,
        fast_path_record_path: null,
        routing_record_path: null,
        routed_at: null,
        completed_at: null,
        result_record_path: null,
        notes: "dry run seed"
      }
    ]
  };

  const request = {
    candidate_id: "dryrun-discovery-case-record-check",
    candidate_name: "Dry Run Discovery Case Record Check",
    intake: {
      intake_date: "2026-03-22",
      source_type: "internal-signal",
      source_reference: "mission-control/scripts/check-discovery-case-record-writer.ts",
      submitted_by: "codex",
      why_it_entered_the_system: "Need one canonical split-case writer for Discovery front-door operation.",
      claimed_value: "Generates the human-readable split record set from one validated payload.",
      initial_relevance_to_workspace: "Strengthens Discovery as the front door rather than a manual markdown process.",
      suspected_adoption_target: "architecture"
    },
    triage: {
      triage_date: "2026-03-22",
      first_pass_summary: "The candidate closes the remaining split-case manual-choreography gap.",
      problem_it_appears_to_solve: "Manual intake, triage, routing, and completion markdown authoring drifts from queue truth.",
      extractable_value_hypothesis: "One case writer can keep split records and queue lifecycle synchronized.",
      routing_recommendation: "Route to Architecture because the value is internal operating logic.",
      proposed_adoption_target: "reusable internal operating logic",
      stack_shape_summary: "DW shared-lib writer mirrored into Mission Control host scripts.",
      boilerplate_vs_product_boundary: "The writer handles canonical record generation while host scripts stay enforcement wrappers.",
      suggested_decision_state: "adopt",
      fit_to_current_direction: "Directly aligned with CLAUDE.md front-door doctrine.",
      reusability_across_surfaces: "Reusable across split Discovery cases that need intake plus triage plus routing.",
      operational_risk: "Low because file generation stays bounded inside directive-workspace.",
      integration_cost: "Low because existing lifecycle sync and record writers are reused.",
      can_current_gates_validate_safely: "Yes, through a temp-workspace writer check.",
      immediate_risks: "Minimal risk of format drift if schema and mirror are kept in sync.",
      missing_evidence: "Need an end-to-end temp-workspace proof.",
      next_action: "Generate the split case records and move queue state to completed."
    },
    routing: {
      route_date: "2026-03-22",
      source_type: "internal-signal",
      decision_state: "adopt",
      adoption_target: "reusable internal operating logic",
      route_destination: "architecture",
      why_this_route: "This improves Discovery system logic rather than a runtime capability lane.",
      why_not_alternatives: "Forge would be premature because the value is not a callable runtime surface.",
      receiving_track_owner: "architecture",
      required_next_artifact: "architecture/03-adopted/2026-03-22-dry-run-case-record-adopted.md"
    },
    completion: {
      decision_date: "2026-03-22",
      decision_state: "adopt",
      adoption_target: "reusable internal operating logic",
      route_destination: "architecture",
      rationale: "The split-case writer keeps Discovery records and queue state aligned from one payload.",
      evidence_path: "architecture/03-adopted/2026-03-22-dry-run-case-record-adopted.md",
      validation_method: "Temp-workspace end-to-end case writer execution.",
      rollback_note: "Delete generated records and restore the queue entry.",
      output_relative_path: "architecture/03-adopted/2026-03-22-dry-run-case-record-adopted.md"
    }
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
      `discovery case record writer failed: ${String((error as Error).message || error)}`,
    );
  }

  const intakePath = path.join(
    tempDirectiveRoot,
    "discovery",
    "intake",
    "2026-03-22-dryrun-discovery-case-record-check-intake.md",
  );
  const triagePath = path.join(
    tempDirectiveRoot,
    "discovery",
    "triage",
    "2026-03-22-dryrun-discovery-case-record-check-triage.md",
  );
  const routingPath = path.join(
    tempDirectiveRoot,
    "discovery",
    "routing-log",
    "2026-03-22-dryrun-discovery-case-record-check-routing-record.md",
  );
  const completionPath = path.join(
    tempDirectiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-22-dry-run-case-record-adopted.md",
  );

  const updatedQueue = JSON.parse(fs.readFileSync(queuePath, "utf8")) as {
    entries: Array<Record<string, unknown>>;
  };
  const entry = updatedQueue.entries[0];

  if (!fs.existsSync(intakePath)) {
    issues.push("intake record file was not created");
  }
  if (!fs.existsSync(triagePath)) {
    issues.push("triage record file was not created");
  }
  if (!fs.existsSync(routingPath)) {
    issues.push("routing record file was not created");
  }
  if (!fs.existsSync(completionPath)) {
    issues.push("completion record file was not created");
  }

  if (fs.existsSync(routingPath)) {
    const routingContent = fs.readFileSync(routingPath, "utf8");
    if (
      !routingContent.includes(
        "Linked triage record: discovery/triage/2026-03-22-dryrun-discovery-case-record-check-triage.md",
      )
    ) {
      issues.push("routing record content missing linked triage record");
    }
  }

  if (entry.status !== "completed") {
    issues.push("queue entry was not moved to completed");
  }
  if (
    entry.intake_record_path !==
    "discovery/intake/2026-03-22-dryrun-discovery-case-record-check-intake.md"
  ) {
    issues.push("queue entry intake_record_path mismatch");
  }
  if (
    entry.routing_record_path !==
    "discovery/routing-log/2026-03-22-dryrun-discovery-case-record-check-routing-record.md"
  ) {
    issues.push("queue entry routing_record_path mismatch");
  }
  if (
    entry.result_record_path !==
    "architecture/03-adopted/2026-03-22-dry-run-case-record-adopted.md"
  ) {
    issues.push("queue entry result_record_path mismatch");
  }

  fs.rmSync(tempDir, { recursive: true, force: true });

  const ok = issues.length === 0;
  console.log(
    JSON.stringify(
      {
        ok,
        metrics: {
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
