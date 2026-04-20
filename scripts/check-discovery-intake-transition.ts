import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

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
    "discovery-intake-transition-request.schema.json",
  );
  const scriptPath = path.join(process.cwd(), "scripts", "transition-discovery-intake-entry.ts");
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  if (!fs.existsSync(contractPath)) issues.push("missing discovery intake queue contract");
  if (!fs.existsSync(schemaPath)) issues.push("missing discovery intake transition schema");
  if (!fs.existsSync(scriptPath)) issues.push("missing discovery intake transition writer");
  if (!fs.existsSync(tsxPath)) issues.push("missing tsx runner");

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-intake-transition-check-"));
  const queuePath = path.join(tempDir, "intake-queue.json");
  const requestPath = path.join(tempDir, "transition-request.json");
  const expectedTransitionDate = new Date().toISOString().slice(0, 10);

  const queue = {
    status: "primary",
    updatedAt: "2026-03-22",
    entries: [
      {
        candidate_id: "dryrun-discovery-transition-check",
        candidate_name: "Dry Run Discovery Transition Check",
        source_type: "internal-signal",
        source_reference: "mc-operator/scripts/check-discovery-intake-transition.ts",
        received_at: "2026-03-22",
        status: "processing",
        routing_target: null,
        mission_alignment: "Discovery as operational front door",
        capability_gap_id: "gap-discovery-front-door-coverage",
        assigned_worker: null,
        fast_path_record_path: null,
        routed_at: null,
        completed_at: null,
        result_record_path: null,
        notes: "dry run seed"
      }
    ]
  };

  const request = {
    candidate_id: "dryrun-discovery-transition-check",
    target_status: "routed",
    routing_target: "architecture",
    fast_path_record_path:
      "discovery/intake/2026-03-22-openclaw-discovery-submission-flow-intake.md",
    note_append: "dry-run transition"
  };

  fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  fs.writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

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
        `& '${tsxPath}' '${scriptPath}' --input-json-path '${requestPath}' --queue-path '${queuePath}' --dry-run`,
      ],
      { encoding: "utf8" },
    );
    parsed = JSON.parse(output.trim()) as Record<string, unknown>;
  } catch (error) {
    issues.push(`discovery transition writer dry-run failed: ${String((error as Error).message || error)}`);
  }
  const afterQueue = fs.readFileSync(queuePath, "utf8");
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (beforeQueue !== afterQueue) {
    issues.push("dry-run mutated queue file");
  }

  if (!parsed || parsed.ok !== true) {
    issues.push("transition dry-run did not return ok=true");
  } else {
    const entry = parsed.entry as Record<string, unknown> | undefined;
    if (!entry) {
      issues.push("transition dry-run missing entry preview");
    } else {
      if (entry.status !== "routed") issues.push("transition preview status must be routed");
      if (entry.routing_target !== "architecture") {
        issues.push("transition preview routing_target mismatch");
      }
      if (entry.routed_at !== expectedTransitionDate) {
        issues.push("transition preview routed_at mismatch");
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
