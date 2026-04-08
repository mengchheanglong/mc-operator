import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runTsx(tsxPath: string, scriptPath: string, args: string[]) {
  return execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `& '${tsxPath}' '${scriptPath}' ${args.map((arg) => `'${arg}'`).join(" ")}`,
    ],
    { encoding: "utf8" },
  );
}

function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const directiveRoot = path.join(root, "workspace", "directive-workspace");
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "discovery-submission-request.schema.json",
  );
  const scriptPath = path.join(process.cwd(), "scripts", "submit-discovery-entry.ts");
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  if (!fs.existsSync(schemaPath)) issues.push("missing discovery submission schema");
  if (!fs.existsSync(scriptPath)) issues.push("missing unified discovery submission script");
  if (!fs.existsSync(tsxPath)) issues.push("missing tsx runner");
  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-discovery-submit-"));
  const tempDirectiveRoot = path.join(tempDir, "directive-workspace");
  const queuePath = path.join(tempDirectiveRoot, "discovery", "intake-queue.json");
  const gapsPath = path.join(tempDirectiveRoot, "discovery", "capability-gaps.json");
  const missionPath = path.join(tempDirectiveRoot, "knowledge", "active-mission.md");
  const canonicalMissionPath = path.join(
    directiveRoot,
    "knowledge",
    "active-mission.md",
  );

  writeJson(queuePath, {
    status: "primary",
    updatedAt: "2026-03-22",
    policy: { schemaRef: "shared/schemas/discovery-intake-queue-entry.schema.json" },
    entries: [],
  });
  writeJson(gapsPath, {
    gaps: [{ gap_id: "gap-discovery-front-door-coverage", resolved_at: null }],
  });
  fs.mkdirSync(path.dirname(missionPath), { recursive: true });
  fs.copyFileSync(canonicalMissionPath, missionPath);

  const queueOnlyRequestPath = path.join(tempDir, "queue-only-request.json");
  const fastPathRequestPath = path.join(tempDir, "fast-path-request.json");
  const splitCaseRequestPath = path.join(tempDir, "split-case-request.json");

  writeJson(queueOnlyRequestPath, {
    candidate_id: "dryrun-queue-only-discovery-submission",
    candidate_name: "Dry Run Queue Only Discovery Submission",
    source_reference: "mission-control/scripts/check-discovery-submission-router.ts",
    source_type: "internal-signal",
    mission_alignment: "Discovery as front door",
    capability_gap_id: "gap-discovery-front-door-coverage",
  });
  writeJson(fastPathRequestPath, {
    candidate_id: "dryrun-fast-path-discovery-submission",
    candidate_name: "Dry Run Fast Path Discovery Submission",
    source_reference: "mission-control/scripts/check-discovery-submission-router.ts",
    source_type: "internal-signal",
    mission_alignment: "Discovery as front door",
    capability_gap_id: "gap-discovery-front-door-coverage",
    fast_path: {
      record_date: "2026-03-22",
      claimed_value: "Lets one operator payload create a simple routed Discovery record.",
      first_pass_summary: "Simple signal with clear route and low ambiguity.",
      adoption_target: "reusable internal operating logic",
      decision_state: "adopt",
      route_destination: "architecture",
      why_this_route: "This improves Discovery structure rather than runtime behavior.",
      why_not_alternatives: "Split-case is unnecessary for a simple low-dispute signal.",
      need_bounded_proof: "Check the generated record and queue transition.",
      next_artifact: "architecture/02-experiments/2026-03-22-dry-run-fast-path.md"
    }
  });
  writeJson(splitCaseRequestPath, {
    candidate_id: "dryrun-split-case-discovery-submission",
    candidate_name: "Dry Run Split Case Discovery Submission",
    source_reference: "mission-control/scripts/check-discovery-submission-router.ts",
    source_type: "internal-signal",
    mission_alignment: "Discovery as front door",
    capability_gap_id: "gap-discovery-front-door-coverage",
    case_record: {
      intake: {
        intake_date: "2026-03-22",
        submitted_by: "codex",
        why_it_entered_the_system: "Need a more complex case path.",
        claimed_value: "Can generate full split Discovery records from one payload.",
        initial_relevance_to_workspace: "Strengthens Discovery operator flow.",
        suspected_adoption_target: "architecture"
      },
      triage: {
        triage_date: "2026-03-22",
        first_pass_summary: "Complex enough to need split records.",
        problem_it_appears_to_solve: "Manual split record authoring drifts from queue state.",
        extractable_value_hypothesis: "One canonical payload can keep everything aligned.",
        routing_recommendation: "Architecture",
        proposed_adoption_target: "reusable internal operating logic",
        stack_shape_summary: "DW shared-lib + host writer",
        boilerplate_vs_product_boundary: "Writer is product logic, script is host wrapper.",
        suggested_decision_state: "adopt",
        fit_to_current_direction: "Aligned with CLAUDE Discovery doctrine.",
        reusability_across_surfaces: "Reusable for complex Discovery cases.",
        operational_risk: "Low",
        integration_cost: "Low",
        can_current_gates_validate_safely: "Yes",
        immediate_risks: "Minimal",
        missing_evidence: "Need temp-workspace execution proof",
        next_action: "Generate records and complete the case."
      },
      routing: {
        route_date: "2026-03-22",
        source_type: "internal-signal",
        decision_state: "adopt",
        adoption_target: "reusable internal operating logic",
        route_destination: "architecture",
        why_this_route: "This is system operating logic, not runtime adoption.",
        why_not_alternatives: "Fast-path is too compressed for this candidate.",
        receiving_track_owner: "architecture",
        required_next_artifact: "architecture/03-adopted/2026-03-22-dry-run-split-case.md"
      },
      completion: {
        decision_date: "2026-03-22",
        decision_state: "adopt",
        adoption_target: "reusable internal operating logic",
        route_destination: "architecture",
        rationale: "The unified submission path closes the operator-flow gap.",
        evidence_path: "architecture/03-adopted/2026-03-22-dry-run-split-case.md",
        validation_method: "Temp-workspace execution",
        rollback_note: "Delete generated records and revert queue state.",
        output_relative_path: "architecture/03-adopted/2026-03-22-dry-run-split-case.md"
      }
    }
  });

  try {
    runTsx(tsxPath, scriptPath, [
      "--input-json-path",
      queueOnlyRequestPath,
      "--queue-path",
      queuePath,
      "--directive-root",
      tempDirectiveRoot,
      "--dry-run",
    ]);
  } catch (error) {
    issues.push(`queue-only dry run failed: ${String((error as Error).message || error)}`);
  }

  try {
    runTsx(tsxPath, scriptPath, [
      "--input-json-path",
      fastPathRequestPath,
      "--queue-path",
      queuePath,
      "--directive-root",
      tempDirectiveRoot,
    ]);
  } catch (error) {
    issues.push(`fast-path submission failed: ${String((error as Error).message || error)}`);
  }

  try {
    runTsx(tsxPath, scriptPath, [
      "--input-json-path",
      splitCaseRequestPath,
      "--queue-path",
      queuePath,
      "--directive-root",
      tempDirectiveRoot,
    ]);
  } catch (error) {
    issues.push(`split-case submission failed: ${String((error as Error).message || error)}`);
  }

  const queue = JSON.parse(fs.readFileSync(queuePath, "utf8")) as {
    entries: Array<Record<string, unknown>>;
  };
  const fastPathEntry = queue.entries.find(
    (entry) => entry.candidate_id === "dryrun-fast-path-discovery-submission",
  );
  const splitCaseEntry = queue.entries.find(
    (entry) => entry.candidate_id === "dryrun-split-case-discovery-submission",
  );

  if (!fs.existsSync(path.join(
    tempDirectiveRoot,
    "discovery",
    "intake",
    "2026-03-22-dryrun-fast-path-discovery-submission-fast-path.md",
  ))) {
    issues.push("fast-path record file was not created");
  }
  if (!fs.existsSync(path.join(
    tempDirectiveRoot,
    "discovery",
    "intake",
    "2026-03-22-dryrun-split-case-discovery-submission-intake.md",
  ))) {
    issues.push("split-case intake record file was not created");
  }
  if (!fs.existsSync(path.join(
    tempDirectiveRoot,
    "discovery",
    "triage",
    "2026-03-22-dryrun-split-case-discovery-submission-triage.md",
  ))) {
    issues.push("split-case triage record file was not created");
  }

  if (!fastPathEntry || fastPathEntry.status !== "routed") {
    issues.push("fast-path queue entry was not moved to routed");
  }
  if (
    !fastPathEntry ||
    fastPathEntry.fast_path_record_path !==
      "discovery/intake/2026-03-22-dryrun-fast-path-discovery-submission-fast-path.md"
  ) {
    issues.push("fast-path queue entry missing fast_path_record_path");
  }
  if (!splitCaseEntry || splitCaseEntry.status !== "completed") {
    issues.push("split-case queue entry was not moved to completed");
  }
  if (
    !splitCaseEntry ||
    splitCaseEntry.intake_record_path !==
      "discovery/intake/2026-03-22-dryrun-split-case-discovery-submission-intake.md"
  ) {
    issues.push("split-case queue entry missing intake_record_path");
  }
  if (
    !splitCaseEntry ||
    splitCaseEntry.result_record_path !==
      "architecture/03-adopted/2026-03-22-dry-run-split-case.md"
  ) {
    issues.push("split-case queue entry missing result_record_path");
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
