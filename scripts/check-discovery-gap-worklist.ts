import fs from "node:fs";
import path from "node:path";
import {
  type CapabilityGapRecord,
  type DiscoveryGapWorklist,
  type DiscoveryGapWorklistItem,
  type DiscoveryQueueEntry,
  generateDiscoveryGapWorklist,
} from "../src/lib/directive-workspace/discovery-gap-worklist-generator";

const VALID_GAP_STATUS = [
  "ready",
  "in_progress",
  "blocked",
  "monitoring",
  "resolved",
];

const VALID_TRACKS = ["discovery", "architecture", "forge"];
const VALID_PRIORITIES = ["high", "medium", "low"];

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const worklistPath = path.join(directiveRoot, "discovery", "gap-worklist.json");
  const gapsPath = path.join(directiveRoot, "discovery", "capability-gaps.json");
  const queuePath = path.join(directiveRoot, "discovery", "intake-queue.json");
  const activeMissionPath = path.join(directiveRoot, "knowledge", "active-mission.md");

  const issues: string[] = [];

  if (!fs.existsSync(worklistPath)) {
    issues.push("discovery/gap-worklist.json does not exist");
  }
  if (!fs.existsSync(gapsPath)) {
    issues.push("discovery/capability-gaps.json does not exist");
  }
  if (!fs.existsSync(queuePath)) {
    issues.push("discovery/intake-queue.json does not exist");
  }
  if (!fs.existsSync(activeMissionPath)) {
    issues.push("knowledge/active-mission.md does not exist");
  }

  if (issues.length > 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, issues }, null, 2)}\n`);
    process.exit(1);
  }

  const worklist = readJson<DiscoveryGapWorklist>(worklistPath);
  const gaps = readJson<{ gaps: CapabilityGapRecord[] }>(gapsPath);
  const queue = readJson<{ entries: DiscoveryQueueEntry[] }>(queuePath);
  const activeMissionMarkdown = fs.readFileSync(activeMissionPath, "utf8");

  const expected = generateDiscoveryGapWorklist({
    updatedAt: worklist.updatedAt,
    gaps: gaps.gaps,
    intakeQueueEntries: queue.entries,
    activeMissionMarkdown,
  });

  if (worklist.status !== "active") {
    issues.push("gap-worklist.json status must be 'active'");
  }
  if (!Array.isArray(worklist.items)) {
    issues.push("gap-worklist.json items must be an array");
  }

  const seenRanks = new Set<number>();
  for (const item of worklist.items || []) {
    validateWorklistItem(item, directiveRoot, seenRanks, issues);
  }

  if (JSON.stringify(worklist) !== JSON.stringify(expected)) {
    issues.push(
      "gap-worklist.json does not match canonical generated output; run npm run discovery:sync:gap-worklist",
    );
  }

  const ok = issues.length === 0;
  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        metrics: {
          openGaps: expected.items.length,
          worklistItems: worklist.items?.length ?? 0,
          queueEntries: queue.entries.length,
          failedChecks: issues.length,
        },
        issues,
      },
      null,
      2,
    )}\n`,
  );

  if (!ok) {
    process.exit(1);
  }
}

function validateWorklistItem(
  item: DiscoveryGapWorklistItem,
  directiveRoot: string,
  seenRanks: Set<number>,
  issues: string[],
) {
  if (!item.gap_id) {
    issues.push("worklist item missing gap_id");
    return;
  }

  if (!VALID_PRIORITIES.includes(item.gap_priority)) {
    issues.push(`${item.gap_id}: invalid gap_priority`);
  }
  if (!VALID_GAP_STATUS.includes(item.gap_status)) {
    issues.push(`${item.gap_id}: invalid gap_status`);
  }
  if (!VALID_TRACKS.includes(item.next_slice_track)) {
    issues.push(`${item.gap_id}: invalid next_slice_track`);
  }
  if (!Number.isInteger(item.worklist_rank) || item.worklist_rank < 1) {
    issues.push(`${item.gap_id}: worklist_rank must be an integer >= 1`);
  } else if (seenRanks.has(item.worklist_rank)) {
    issues.push(`${item.gap_id}: duplicated worklist_rank ${item.worklist_rank}`);
  } else {
    seenRanks.add(item.worklist_rank);
  }

  const scoreInputs = [
    ["mission_pressure", item.score_breakdown.mission_pressure],
    ["mission_leverage", item.score_breakdown.mission_leverage],
    ["proof_clarity", item.score_breakdown.proof_clarity],
    ["adaptation_leverage", item.score_breakdown.adaptation_leverage],
    ["blocker_severity", item.score_breakdown.blocker_severity],
  ] as const;

  for (const [label, value] of scoreInputs) {
    if (!Number.isInteger(value) || value < 0 || value > 5) {
      issues.push(`${item.gap_id}: ${label} must be an integer between 0 and 5`);
    }
  }

  if (!Number.isInteger(item.priority_score)) {
    issues.push(`${item.gap_id}: priority_score must be an integer`);
  }
  if (!item.mission_objective.trim()) {
    issues.push(`${item.gap_id}: mission_objective is required`);
  }
  if (!item.next_action.trim()) {
    issues.push(`${item.gap_id}: next_action is required`);
  }

  if (item.latest_result_path) {
    const resultPath = path.join(directiveRoot, item.latest_result_path);
    if (!fs.existsSync(resultPath)) {
      issues.push(`${item.gap_id}: latest_result_path not found: ${item.latest_result_path}`);
    }
  }
}

main();
