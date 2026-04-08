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
    "routing-record.md",
  );
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "discovery-routing-record-request.schema.json",
  );
  const scriptPath = path.join(process.cwd(), "scripts", "write-discovery-routing-record.ts");
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  if (!fs.existsSync(contractPath)) issues.push("missing routing record template");
  if (!fs.existsSync(schemaPath)) issues.push("missing discovery routing record schema");
  if (!fs.existsSync(scriptPath)) issues.push("missing discovery routing record writer");
  if (!fs.existsSync(tsxPath)) issues.push("missing tsx runner");

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-routing-record-writer-"));
  const tempDirectiveRoot = path.join(tempDir, "directive-workspace");
  const queuePath = path.join(tempDirectiveRoot, "discovery", "intake-queue.json");
  const requestPath = path.join(tempDir, "routing-record-request.json");
  const intakePath = path.join(
    tempDirectiveRoot,
    "discovery",
    "intake",
    "2026-03-22-dry-run-routing-intake.md",
  );
  const expectedRoutingPath = path.join(
    tempDirectiveRoot,
    "discovery",
    "routing-log",
    "2026-03-22-dryrun-discovery-routing-record-check-routing-record.md",
  );

  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.mkdirSync(path.dirname(intakePath), { recursive: true });
  fs.writeFileSync(intakePath, "# dry run intake\n", "utf8");

  const queue = {
    status: "primary",
    updatedAt: "2026-03-22",
    entries: [
      {
        candidate_id: "dryrun-discovery-routing-record-check",
        candidate_name: "Dry Run Discovery Routing Record Check",
        source_type: "internal-signal",
        source_reference: "mission-control/scripts/check-discovery-routing-record-writer.ts",
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
    candidate_id: "dryrun-discovery-routing-record-check",
    candidate_name: "Dry Run Discovery Routing Record Check",
    route_date: "2026-03-22",
    source_type: "internal-signal",
    decision_state: "adopt",
    adoption_target: "reusable internal operating logic",
    route_destination: "architecture",
    why_this_route: "This candidate improves Discovery operating structure rather than runtime capability.",
    why_not_alternatives: "Forge would be premature because the current value is routing logic, not a callable lane.",
    receiving_track_owner: "architecture",
    required_next_artifact: "architecture/02-experiments/2026-03-22-dry-run-routing-slice.md",
    linked_intake_record: "discovery/intake/2026-03-22-dry-run-routing-intake.md"
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
      `discovery routing record writer failed: ${String((error as Error).message || error)}`,
    );
  }

  const updatedQueue = JSON.parse(fs.readFileSync(queuePath, "utf8")) as {
    entries: Array<Record<string, unknown>>;
  };
  const entry = updatedQueue.entries[0];
  const routingRecordExists = fs.existsSync(expectedRoutingPath);
  const routingRecordContent = routingRecordExists
    ? fs.readFileSync(expectedRoutingPath, "utf8")
    : "";
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (!routingRecordExists) {
    issues.push("routing record file was not created");
  }
  if (!routingRecordContent.includes("Route destination: architecture")) {
    issues.push("routing record content missing route destination");
  }
  if (entry.status !== "routed") {
    issues.push("queue entry was not moved to routed");
  }
  if (entry.routing_record_path !== "discovery/routing-log/2026-03-22-dryrun-discovery-routing-record-check-routing-record.md") {
    issues.push("queue entry missing routing_record_path");
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
