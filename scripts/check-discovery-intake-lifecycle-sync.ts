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
    "contracts",
    "discovery-intake-queue.md",
  );
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "discovery-intake-lifecycle-sync-request.schema.json",
  );
  const scriptPath = path.join(process.cwd(), "scripts", "sync-discovery-intake-lifecycle.ts");
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  if (!fs.existsSync(contractPath)) issues.push("missing discovery intake queue contract");
  if (!fs.existsSync(schemaPath)) issues.push("missing lifecycle sync schema");
  if (!fs.existsSync(scriptPath)) issues.push("missing discovery lifecycle sync writer");
  if (!fs.existsSync(tsxPath)) issues.push("missing tsx runner");

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-intake-lifecycle-sync-"));
  const tempDirectiveRoot = path.join(tempDir, "directive-workspace");
  const queuePath = path.join(tempDirectiveRoot, "discovery", "intake-queue.json");
  const requestPath = path.join(tempDir, "lifecycle-sync-request.json");
  const fastPath = path.join(
    tempDirectiveRoot,
    "discovery",
    "intake",
    "2026-03-22-dry-run-lifecycle-intake.md",
  );
  const resultPath = path.join(
    tempDirectiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-22-dry-run-lifecycle-adopted.md",
  );
  const routingPath = path.join(
    tempDirectiveRoot,
    "discovery",
    "routing-log",
    "2026-03-22-dry-run-lifecycle-routing.md",
  );

  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.mkdirSync(path.dirname(fastPath), { recursive: true });
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.mkdirSync(path.dirname(routingPath), { recursive: true });
  fs.writeFileSync(fastPath, "# dry run intake\n", "utf8");
  fs.writeFileSync(resultPath, "# dry run adopted\n", "utf8");
  fs.writeFileSync(routingPath, "# dry run routing\n", "utf8");

  const queue = {
    status: "primary",
    updatedAt: "2026-03-22",
    entries: [
      {
        candidate_id: "dryrun-discovery-lifecycle-sync-check",
        candidate_name: "Dry Run Discovery Lifecycle Sync Check",
        source_type: "internal-signal",
        source_reference: "mission-control/scripts/check-discovery-intake-lifecycle-sync.ts",
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
    candidate_id: "dryrun-discovery-lifecycle-sync-check",
    target_phase: "completed",
    routing_target: "architecture",
    assigned_worker: "codex",
    intake_record_path: "discovery/intake/2026-03-22-dry-run-lifecycle-intake.md",
    routing_record_path: "discovery/routing-log/2026-03-22-dry-run-lifecycle-routing.md",
    result_record_path: "architecture/03-adopted/2026-03-22-dry-run-lifecycle-adopted.md",
    note_append: "dry-run lifecycle sync"
  };
  const expectedTransitionDate = new Date().toISOString().slice(0, 10);

  writeJson(queuePath, queue);
  writeJson(requestPath, request);

  const beforeQueue = fs.readFileSync(queuePath, "utf8");
  let parsed: Record<string, unknown> | null = null;
  try {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `& '${tsxPath}' '${scriptPath}' --input-json-path '${requestPath}' --queue-path '${queuePath}' --directive-root '${tempDirectiveRoot}' --dry-run`,
      ],
      { encoding: "utf8" },
    );
    parsed = JSON.parse(output.trim()) as Record<string, unknown>;
  } catch (error) {
    issues.push(
      `discovery lifecycle sync dry-run failed: ${String((error as Error).message || error)}`,
    );
  }
  const afterQueue = fs.readFileSync(queuePath, "utf8");
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (beforeQueue !== afterQueue) {
    issues.push("dry-run mutated queue file");
  }

  if (!parsed || parsed.ok !== true) {
    issues.push("lifecycle sync dry-run did not return ok=true");
  } else {
    const appliedStages = Array.isArray(parsed.appliedStages)
      ? (parsed.appliedStages as string[])
      : [];
    const entry = parsed.entry as Record<string, unknown> | undefined;

    if (appliedStages.join(",") !== "processing,routed,completed") {
      issues.push("lifecycle sync did not apply expected stages");
    }
    if (!entry) {
      issues.push("lifecycle sync dry-run missing entry preview");
    } else {
      if (entry.status !== "completed") issues.push("lifecycle sync preview status must be completed");
      if (entry.routing_target !== "architecture") {
        issues.push("lifecycle sync preview routing_target mismatch");
      }
      if (entry.intake_record_path !== request.intake_record_path) {
        issues.push("lifecycle sync preview intake_record_path mismatch");
      }
      if (entry.routing_record_path !== request.routing_record_path) {
        issues.push("lifecycle sync preview routing_record_path mismatch");
      }
      if (entry.result_record_path !== request.result_record_path) {
        issues.push("lifecycle sync preview result_record_path mismatch");
      }
      if (entry.routed_at !== expectedTransitionDate) {
        issues.push("lifecycle sync preview routed_at mismatch");
      }
      if (entry.completed_at !== expectedTransitionDate) {
        issues.push("lifecycle sync preview completed_at mismatch");
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
