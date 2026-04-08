// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-gap-worklist-generator.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import {
  type DiscoveryGapPriorityLevel,
  computeDiscoveryGapPriorityBreakdown,
} from "./discovery-gap-priority";

export type CapabilityGapRecord = {
  gap_id: string;
  description: string;
  priority: DiscoveryGapPriorityLevel;
  related_mission_objective: string;
  current_state: string;
  desired_state: string;
  candidate_ids?: string[];
  detected_at: string;
  resolved_at?: string | null;
  resolution_notes?: string | null;
};

export type DiscoveryQueueEntryStatus =
  | "pending"
  | "processing"
  | "routed"
  | "completed"
  | "held";

export type DiscoveryQueueEntry = {
  candidate_id?: string;
  status?: DiscoveryQueueEntryStatus;
  routing_target?:
    | "architecture"
    | "forge"
    | "monitor"
    | "defer"
    | "reject"
    | "reference"
    | null;
  capability_gap_id?: string | null;
  received_at?: string;
  routed_at?: string | null;
  completed_at?: string | null;
  result_record_path?: string | null;
};

export type ActiveMissionProfile = {
  currentObjective: string;
  usefulnessSignals: string[];
  capabilityLanes: string[];
};

export type DiscoveryGapWorklistItem = {
  gap_id: string;
  worklist_rank: number;
  gap_priority: DiscoveryGapPriorityLevel;
  priority_score: number;
  score_breakdown: {
    base_priority: number;
    mission_pressure: number;
    mission_leverage: number;
    proof_clarity: number;
    adaptation_leverage: number;
    blocker_severity: number;
    blocker_penalty: number;
  };
  mission_objective: string;
  gap_status: "ready" | "in_progress" | "blocked" | "monitoring" | "resolved";
  next_slice_track: "discovery" | "architecture" | "forge";
  latest_candidate_id: string | null;
  latest_candidate_status: DiscoveryQueueEntryStatus | null;
  latest_result_path: string | null;
  next_action: string;
  blocking_reason: string | null;
};

export type DiscoveryGapWorklist = {
  status: "active";
  updatedAt: string;
  policy: {
    selectionRule: string;
    syncRule: string;
    openGapRule: string;
  };
  items: DiscoveryGapWorklistItem[];
};

const ADAPTATION_KEYWORDS = [
  "adapt",
  "adaptation",
  "analysis",
  "architecture",
  "discovery",
  "evaluate",
  "evaluation",
  "front door",
  "gap",
  "ingestion",
  "intake",
  "proof",
  "route",
  "routing",
  "source",
  "transform",
  "transformation",
  "workflow",
];

const BLOCKER_HINTS = [
  "blocked",
  "blocker",
  "cannot",
  "deferred",
  "dependency",
  "depends on",
  "missing prerequisite",
  "unavailable",
  "waiting on",
];

const DISCOVERY_HINTS = [
  "coverage",
  "discovery",
  "front door",
  "intake",
  "monitor",
  "queue",
  "review cadence",
  "route",
  "routing",
];

const FORGE_HINTS = [
  "callable",
  "cost",
  "forge",
  "import",
  "latency",
  "performance",
  "runtime",
  "skill",
  "smoke",
  "transform",
  "transformation",
];

const PROOF_HINTS = [
  "all new",
  "at least",
  "benchmark",
  "checker",
  "count",
  "coverage",
  "every",
  "latency",
  "metric",
  "ratio",
  "score",
  "threshold",
];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "through",
  "plus",
  "only",
  "when",
  "than",
  "over",
  "under",
  "same",
  "still",
  "must",
  "mode",
  "work",
  "goal",
  "lane",
]);

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSectionBody(markdown: string, heading: string) {
  const pattern = new RegExp(
    `^## ${escapeRegex(heading)}\\r?\\n([\\s\\S]*?)(?=^##\\s|\\Z)`,
    "m",
  );
  return markdown.match(pattern)?.[1]?.trim() ?? "";
}

function tokenize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function countKeywordHits(text: string, keywords: string[]) {
  const lowered = text.toLowerCase();
  return keywords.reduce(
    (count, keyword) => count + (lowered.includes(keyword.toLowerCase()) ? 1 : 0),
    0,
  );
}

function findMissionLaneRank(profile: ActiveMissionProfile, gap: CapabilityGapRecord) {
  const objectiveTokens = new Set(
    tokenize(`${gap.related_mission_objective} ${gap.description}`),
  );
  let bestRank = profile.capabilityLanes.length + 1;
  let bestScore = -1;

  profile.capabilityLanes.forEach((lane, index) => {
    const laneTokens = new Set(tokenize(lane));
    let overlap = 0;
    for (const token of objectiveTokens) {
      if (laneTokens.has(token)) {
        overlap += 1;
      }
    }
    if (overlap > bestScore) {
      bestScore = overlap;
      bestRank = index + 1;
    }
  });

  return bestRank;
}

function deriveMissionPressure(laneRank: number) {
  if (laneRank <= 2) return 5;
  if (laneRank <= 3) return 4;
  if (laneRank <= 5) return 3;
  return 2;
}

function deriveMissionLeverage(laneRank: number) {
  if (laneRank <= 2) return 5;
  if (laneRank <= 4) return 4;
  if (laneRank <= 6) return 3;
  return 2;
}

function deriveProofClarity(gap: CapabilityGapRecord) {
  const combined = `${gap.description} ${gap.current_state} ${gap.desired_state}`;
  const hits = countKeywordHits(combined, PROOF_HINTS);
  return Math.min(5, 1 + hits);
}

function deriveAdaptationLeverage(gap: CapabilityGapRecord, laneRank: number) {
  const combined = `${gap.related_mission_objective} ${gap.description} ${gap.desired_state}`;
  const keywordHits = countKeywordHits(combined, ADAPTATION_KEYWORDS);
  let score = 2;
  if (keywordHits >= 2) score += 2;
  if (laneRank <= 3) score += 1;
  return Math.min(5, score);
}

function extractBlockingReason(gap: CapabilityGapRecord) {
  const combined = `${gap.description} ${gap.current_state}`.toLowerCase();
  const keyword = BLOCKER_HINTS.find((hint) => combined.includes(hint));
  if (!keyword) {
    return null;
  }
  return `Gap description indicates an active blocking condition: ${keyword}.`;
}

function deriveNextSliceTrack(gap: CapabilityGapRecord) {
  const combined = `${gap.related_mission_objective} ${gap.description} ${gap.desired_state}`.toLowerCase();
  if (countKeywordHits(combined, DISCOVERY_HINTS) > 0) {
    return "discovery" as const;
  }
  if (countKeywordHits(combined, FORGE_HINTS) > 0) {
    return "forge" as const;
  }
  return "architecture" as const;
}

function resolveEntryDate(entry: DiscoveryQueueEntry) {
  return entry.completed_at || entry.routed_at || entry.received_at || "";
}

function resolveLatestCandidate(
  gap: CapabilityGapRecord,
  intakeQueueEntries: DiscoveryQueueEntry[],
) {
  const candidateIds = new Set(gap.candidate_ids ?? []);
  const candidates = intakeQueueEntries.filter((entry) => {
    const candidateId = String(entry.candidate_id || "");
    return (
      entry.capability_gap_id === gap.gap_id ||
      (candidateId.length > 0 && candidateIds.has(candidateId))
    );
  });

  candidates.sort((left, right) => {
    const leftDate = resolveEntryDate(left);
    const rightDate = resolveEntryDate(right);
    return rightDate.localeCompare(leftDate);
  });

  return candidates[0] ?? null;
}

function deriveGapStatus(
  latestCandidate: DiscoveryQueueEntry | null,
  blockingReason: string | null,
) {
  if (blockingReason) {
    return "blocked" as const;
  }
  if (!latestCandidate) {
    return "ready" as const;
  }
  if (
    latestCandidate.status === "pending" ||
    latestCandidate.status === "processing" ||
    latestCandidate.status === "routed" ||
    latestCandidate.status === "completed"
  ) {
    return "in_progress" as const;
  }
  if (latestCandidate.status === "held") {
    return "blocked" as const;
  }
  return "ready" as const;
}

function deriveNextAction(
  gap: CapabilityGapRecord,
  nextSliceTrack: "discovery" | "architecture" | "forge",
  latestCandidate: DiscoveryQueueEntry | null,
  blockingReason: string | null,
) {
  if (blockingReason) {
    return `Resolve the current blocker before reopening the next bounded ${nextSliceTrack} slice.`;
  }

  if (
    nextSliceTrack === "discovery" &&
    gap.related_mission_objective.toLowerCase().includes("front door")
  ) {
    if (latestCandidate?.status === "completed") {
      return "Keep routing new mission-relevant candidates through Discovery first and grow native intake coverage until front-door usage is routine instead of backfill-driven.";
    }
    return "Open the next bounded Discovery slice that increases native front-door usage and improves intake-to-routing coverage.";
  }

  if (nextSliceTrack === "forge") {
    return "Open the next bounded Forge slice that converts the remaining gap into a measurable runtime or behavior-preserving transformation gain.";
  }

  return "Open the next bounded Architecture slice that converts the remaining gap into Directive-owned operating code.";
}

export function parseActiveMissionProfile(markdown: string): ActiveMissionProfile {
  const currentObjective = getSectionBody(markdown, "Current Objective")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  const usefulnessSignals = getSectionBody(
    markdown,
    "What Usefulness Means Under This Objective",
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
  const capabilityLanes = getSectionBody(markdown, "Capability Lanes That Matter Most")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, "").trim());

  return {
    currentObjective,
    usefulnessSignals,
    capabilityLanes,
  };
}

export function generateDiscoveryGapWorklist(input: {
  updatedAt: string;
  gaps: CapabilityGapRecord[];
  intakeQueueEntries: DiscoveryQueueEntry[];
  activeMissionMarkdown: string;
}): DiscoveryGapWorklist {
  const missionProfile = parseActiveMissionProfile(input.activeMissionMarkdown);

  const items = input.gaps
    .filter((gap) => !gap.resolved_at)
    .map((gap) => {
      const laneRank = findMissionLaneRank(missionProfile, gap);
      const missionPressure = deriveMissionPressure(laneRank);
      const missionLeverage = deriveMissionLeverage(laneRank);
      const proofClarity = deriveProofClarity(gap);
      const adaptationLeverage = deriveAdaptationLeverage(gap, laneRank);
      const blockingReason = extractBlockingReason(gap);
      const blockerSeverity = blockingReason ? 3 : 0;
      const nextSliceTrack = deriveNextSliceTrack(gap);
      const latestCandidate = resolveLatestCandidate(gap, input.intakeQueueEntries);
      const breakdown = computeDiscoveryGapPriorityBreakdown({
        gapPriority: gap.priority,
        missionPressure,
        missionLeverage,
        proofClarity,
        adaptationLeverage,
        blockerSeverity,
      });
      const gapStatus = deriveGapStatus(latestCandidate, blockingReason);

      return {
        gap_id: gap.gap_id,
        worklist_rank: 0,
        gap_priority: gap.priority,
        priority_score: breakdown.total,
        score_breakdown: {
          base_priority: breakdown.basePriority,
          mission_pressure: breakdown.missionPressure,
          mission_leverage: breakdown.missionLeverage,
          proof_clarity: breakdown.proofClarity,
          adaptation_leverage: breakdown.adaptationLeverage,
          blocker_severity: blockerSeverity,
          blocker_penalty: breakdown.blockerPenalty,
        },
        mission_objective: gap.related_mission_objective,
        gap_status: gapStatus,
        next_slice_track: nextSliceTrack,
        latest_candidate_id: latestCandidate?.candidate_id ?? null,
        latest_candidate_status: latestCandidate?.status ?? null,
        latest_result_path: latestCandidate?.result_record_path ?? null,
        next_action: deriveNextAction(
          gap,
          nextSliceTrack,
          latestCandidate,
          blockingReason,
        ),
        blocking_reason: blockingReason,
      } satisfies DiscoveryGapWorklistItem;
    })
    .sort((left, right) => {
      if (right.priority_score !== left.priority_score) {
        return right.priority_score - left.priority_score;
      }
      return left.gap_id.localeCompare(right.gap_id);
    })
    .map((item, index) => ({
      ...item,
      worklist_rank: index + 1,
    }));

  return {
    status: "active",
    updatedAt: input.updatedAt,
    policy: {
      selectionRule:
        "When choosing the next Discovery-native internal slice, sort unresolved gaps by priority_score descending, then use worklist_rank as the tie-breaker before opening a bounded slice on the top-ranked gap.",
      syncRule:
        "gap-worklist.json is generated from capability-gaps.json, intake-queue.json, and knowledge/active-mission.md through the canonical shared generator. Do not hand-edit item rows.",
      openGapRule:
        "An unresolved gap may remain open after a completed queue candidate; keep it on the worklist until the underlying operating condition is actually closed.",
    },
    items,
  };
}
