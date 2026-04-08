import fs from "node:fs";
import path from "node:path";

type EntryCheck = {
  candidateId: string;
  issues: string[];
  ok: boolean;
};

type QueueReport = {
  queueExists: boolean;
  entryCount: number;
  byStatus: Record<string, number>;
  entryChecks: EntryCheck[];
  markdownLinkageIssues: string[];
  schemaIssues: string[];
  overallOk: boolean;
};

const REQUIRED_FIELDS = [
  "candidate_id",
  "candidate_name",
  "source_type",
  "received_at",
  "status",
  "routing_target",
];

const VALID_STATUSES = ["pending", "processing", "routed", "completed", "held"];

const VALID_ROUTING_TARGETS = [
  "forge",
  "architecture",
  "monitor",
  "defer",
  "reject",
  "reference",
  null,
];

const VALID_SOURCE_TYPES = [
  "github-repo",
  "paper",
  "product-doc",
  "theory",
  "technical-essay",
  "workflow-writeup",
  "external-system",
  "internal-signal",
];

function main() {
  const directiveRoot = path.resolve(
    process.cwd(),
    "..",
    "directive-workspace",
  );
  const queuePath = path.join(directiveRoot, "discovery", "intake-queue.json");

  if (!fs.existsSync(queuePath)) {
    console.log("FAIL: intake-queue.json does not exist");
    process.exit(1);
  }

  let queue: {
    status: string;
    updatedAt: string;
    policy: { schemaRef: string };
    entries: Record<string, unknown>[];
  };
  try {
    queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
  } catch {
    console.log("FAIL: intake-queue.json is not valid JSON");
    process.exit(1);
  }

  const report: QueueReport = {
    queueExists: true,
    entryCount: queue.entries?.length ?? 0,
    byStatus: {},
    entryChecks: [],
    markdownLinkageIssues: [],
    schemaIssues: [],
    overallOk: true,
  };

  // Check top-level structure
  if (!queue.status) {
    report.schemaIssues.push("Missing top-level 'status' field");
  }
  if (!queue.entries || !Array.isArray(queue.entries)) {
    report.schemaIssues.push("Missing or non-array 'entries' field");
    report.overallOk = false;
    printReport(report);
    process.exit(1);
  }

  // Check each entry
  for (const entry of queue.entries) {
    const candidateId = (entry.candidate_id as string) ?? "(unknown)";
    const issues: string[] = [];

    // Required fields
    for (const field of REQUIRED_FIELDS) {
      if (entry[field] === undefined || entry[field] === null) {
        // routing_target can be null for pending entries
        if (field === "routing_target" && entry.status === "pending") continue;
        issues.push(`missing required field: ${field}`);
      }
    }

    // Enum validation
    if (
      entry.status &&
      !VALID_STATUSES.includes(entry.status as string)
    ) {
      issues.push(`invalid status: ${entry.status}`);
    }
    if (
      entry.routing_target !== undefined &&
      entry.routing_target !== null &&
      !VALID_ROUTING_TARGETS.includes(entry.routing_target as string | null)
    ) {
      issues.push(`invalid routing_target: ${entry.routing_target}`);
    }
    if (
      entry.source_type &&
      !VALID_SOURCE_TYPES.includes(entry.source_type as string)
    ) {
      issues.push(`invalid source_type: ${entry.source_type}`);
    }

    // Status-specific checks
    if (
      entry.status === "routed" ||
      entry.status === "completed"
    ) {
      if (!entry.routing_target) {
        issues.push("routed/completed entry missing routing_target");
      }
      if (!entry.routed_at) {
        issues.push("routed/completed entry missing routed_at");
      }
    }
    if (entry.status === "completed" && !entry.completed_at) {
      issues.push("completed entry missing completed_at");
    }

    // Markdown linkage check
    if (entry.intake_record_path) {
      const intakePath = path.join(
        directiveRoot,
        entry.intake_record_path as string,
      );
      if (!fs.existsSync(intakePath)) {
        issues.push(
          `intake_record_path not found: ${entry.intake_record_path}`,
        );
        report.markdownLinkageIssues.push(
          `${candidateId}: intake_record_path points to missing file`,
        );
      }
    }

    if (entry.fast_path_record_path) {
      const mdPath = path.join(
        directiveRoot,
        entry.fast_path_record_path as string,
      );
      if (!fs.existsSync(mdPath)) {
        issues.push(
          `fast_path_record_path not found: ${entry.fast_path_record_path}`,
        );
        report.markdownLinkageIssues.push(
          `${candidateId}: fast_path_record_path points to missing file`,
        );
      }
    }

    if (entry.routing_record_path) {
      const routingPath = path.join(
        directiveRoot,
        entry.routing_record_path as string,
      );
      if (!fs.existsSync(routingPath)) {
        issues.push(
          `routing_record_path not found: ${entry.routing_record_path}`,
        );
        report.markdownLinkageIssues.push(
          `${candidateId}: routing_record_path points to missing file`,
        );
      }
    }

    if (entry.result_record_path) {
      const resultPath = path.join(
        directiveRoot,
        entry.result_record_path as string,
      );
      if (!fs.existsSync(resultPath)) {
        issues.push(
          `result_record_path not found: ${entry.result_record_path}`,
        );
        report.markdownLinkageIssues.push(
          `${candidateId}: result_record_path points to missing file`,
        );
      }
    }

    // Capability gap linkage check
    if (entry.capability_gap_id) {
      const gapsPath = path.join(
        directiveRoot,
        "discovery",
        "capability-gaps.json",
      );
      if (fs.existsSync(gapsPath)) {
        try {
          const gaps = JSON.parse(fs.readFileSync(gapsPath, "utf8"));
          const gapIds = (gaps.gaps ?? []).map(
            (g: { gap_id: string }) => g.gap_id,
          );
          if (!gapIds.includes(entry.capability_gap_id)) {
            issues.push(
              `capability_gap_id '${entry.capability_gap_id}' not found in registry`,
            );
          }
        } catch {
          // gap registry not parseable — skip this check
        }
      }
    }

    // Status counts
    const status = (entry.status as string) ?? "unknown";
    report.byStatus[status] = (report.byStatus[status] ?? 0) + 1;

    const ok = issues.length === 0;
    if (!ok) report.overallOk = false;

    report.entryChecks.push({ candidateId, issues, ok });
  }

  printReport(report);
  process.exit(report.overallOk ? 0 : 1);
}

function printReport(report: QueueReport) {
  const { entryCount, byStatus, entryChecks, markdownLinkageIssues, schemaIssues, overallOk } = report;

  const okCount = entryChecks.filter((c) => c.ok).length;
  const failCount = entryChecks.filter((c) => !c.ok).length;

  console.log(
    `Discovery intake queue: ${entryCount} entries, ${okCount} valid, ${failCount} invalid`,
  );

  if (entryCount > 0) {
    const statusSummary = Object.entries(byStatus)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    console.log(`  Status breakdown: ${statusSummary}`);
  }

  if (schemaIssues.length > 0) {
    console.log(`\n  Schema issues:`);
    for (const issue of schemaIssues) {
      console.log(`    WARN: ${issue}`);
    }
  }

  for (const check of entryChecks) {
    if (check.ok) {
      console.log(`  OK: ${check.candidateId}`);
    } else {
      console.log(`  FAIL: ${check.candidateId}`);
      for (const issue of check.issues) {
        console.log(`    - ${issue}`);
      }
    }
  }

  if (markdownLinkageIssues.length > 0) {
    console.log(`\n  Markdown linkage issues:`);
    for (const issue of markdownLinkageIssues) {
      console.log(`    WARN: ${issue}`);
    }
  }

  console.log(
    `\n${overallOk ? "PASS" : "FAIL"}: intake queue validation ${overallOk ? "complete" : "found issues"}`,
  );
}

main();
