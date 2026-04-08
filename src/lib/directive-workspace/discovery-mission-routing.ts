// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-mission-routing.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import type { DiscoverySourceType } from "./discovery-intake-queue-writer";
import type { DiscoverySubmissionRequest, DiscoverySubmissionShape } from "./discovery-submission-router";
import {
  generateDiscoveryGapWorklist,
  parseActiveMissionProfile,
  type CapabilityGapRecord,
  type DiscoveryGapWorklistItem,
  type DiscoveryQueueEntry,
} from "./discovery-gap-worklist-generator";

export type DiscoveryRoutingTrack = "discovery" | "architecture" | "forge";

export type DiscoveryMissionRoutingConfidence = "high" | "medium" | "low";

export type DiscoveryMissionRoutingAssessment = {
  recommended_track: DiscoveryRoutingTrack;
  recommended_record_shape: DiscoverySubmissionShape;
  mission_priority_score: number;
  confidence: DiscoveryMissionRoutingConfidence;
  matched_gap_id: string | null;
  matched_gap_rank: number | null;
  explicit_route_destination: DiscoveryRoutingTrack | null;
  route_conflict: boolean;
  needs_human_review: boolean;
  score_breakdown: {
    mission_fit: number;
    gap_alignment: number;
    track_scores: Record<DiscoveryRoutingTrack, number>;
    transformation_signal: number;
    runtime_signal: number;
    ambiguity_penalty: number;
    total: number;
  };
  rationale: string[];
};

const DISCOVERY_KEYWORDS = [
  "discovery",
  "front door",
  "intake",
  "queue",
  "routing",
  "route",
  "monitor",
  "review cadence",
  "coverage",
  "gap",
];

const ARCHITECTURE_KEYWORDS = [
  "architecture",
  "contract",
  "schema",
  "policy",
  "workflow",
  "doctrine",
  "evaluation",
  "evaluator",
  "adaptation",
  "analysis",
  "operating logic",
  "operating code",
  "structure",
];

const FORGE_KEYWORDS = [
  "forge",
  "runtime",
  "callable",
  "skill",
  "automation",
  "workflow",
  "latency",
  "performance",
  "cost",
  "reliability",
  "import",
  "source-pack",
  "runtime capability",
];

const TRANSFORMATION_KEYWORDS = [
  "transform",
  "transformation",
  "behavior-preserving",
  "faster",
  "slower",
  "latency",
  "cost",
  "reliability",
  "same behavior",
  "same capability",
  "better implementation",
  "maintainability",
];

const RUNTIME_SOURCE_TYPES = new Set<DiscoverySourceType>([
  "github-repo",
  "tool",
  "external-system",
] as DiscoverySourceType[]);

const STRUCTURAL_SOURCE_TYPES = new Set<DiscoverySourceType>([
  "paper",
  "product-doc",
  "technical-essay",
  "workflow-writeup",
  "theory",
] as DiscoverySourceType[]);

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "through",
  "when",
  "only",
  "have",
  "will",
  "would",
  "should",
  "about",
  "candidate",
  "current",
  "active",
  "mission",
]);

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
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

function countTokenOverlap(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function flattenRequestText(request: DiscoverySubmissionRequest) {
  const parts = [
    request.candidate_name,
    request.source_reference,
    request.mission_alignment ?? "",
    request.notes ?? "",
  ];

  if (request.fast_path) {
    parts.push(
      request.fast_path.claimed_value,
      request.fast_path.first_pass_summary,
      request.fast_path.why_this_route,
      request.fast_path.why_not_alternatives,
      request.fast_path.need_bounded_proof,
      request.fast_path.next_artifact,
    );
  }

  if (request.case_record) {
    parts.push(
      request.case_record.intake.why_it_entered_the_system,
      request.case_record.intake.claimed_value,
      request.case_record.intake.initial_relevance_to_workspace,
      request.case_record.triage.first_pass_summary,
      request.case_record.triage.problem_it_appears_to_solve,
      request.case_record.triage.extractable_value_hypothesis,
      request.case_record.triage.routing_recommendation,
      request.case_record.triage.next_action,
      request.case_record.routing.why_this_route,
      request.case_record.routing.why_not_alternatives,
      request.case_record.routing.required_next_artifact,
      request.case_record.completion?.rationale ?? "",
    );
  }

  return parts.filter(Boolean).join(" ");
}

function deriveExplicitRouteDestination(
  request: DiscoverySubmissionRequest,
): DiscoveryRoutingTrack | null {
  const explicitRoute =
    request.case_record?.routing.route_destination ??
    request.fast_path?.route_destination ??
    null;
  if (explicitRoute === "architecture" || explicitRoute === "forge") {
    return explicitRoute;
  }
  return null;
}

function findMatchedGap(
  request: DiscoverySubmissionRequest,
  openWorklist: DiscoveryGapWorklistItem[],
  requestText: string,
) {
  if (request.capability_gap_id) {
    const directMatch =
      openWorklist.find((item) => item.gap_id === request.capability_gap_id) ?? null;
    if (directMatch) {
      return directMatch;
    }
  }

  let bestMatch: DiscoveryGapWorklistItem | null = null;
  let bestScore = 0;
  for (const item of openWorklist) {
    const overlap = countTokenOverlap(
      requestText,
      `${item.gap_id} ${item.mission_objective} ${item.next_action} ${item.blocking_reason ?? ""}`,
    );
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = item;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
}

function deriveMissionFit(
  requestText: string,
  activeMissionMarkdown: string,
) {
  const missionProfile = parseActiveMissionProfile(activeMissionMarkdown);
  const objectiveOverlap = countTokenOverlap(requestText, missionProfile.currentObjective);
  const usefulnessOverlap = missionProfile.usefulnessSignals.reduce(
    (score, signal) => score + countTokenOverlap(requestText, signal),
    0,
  );
  const laneOverlap = missionProfile.capabilityLanes.reduce(
    (score, lane) => score + countTokenOverlap(requestText, lane),
    0,
  );
  return clampInt(objectiveOverlap + usefulnessOverlap + laneOverlap, 0, 5);
}

function deriveTrackScores(
  request: DiscoverySubmissionRequest,
  requestText: string,
  matchedGap: DiscoveryGapWorklistItem | null,
) {
  const discoverySignal = countKeywordHits(requestText, DISCOVERY_KEYWORDS);
  const architectureSignal = countKeywordHits(requestText, ARCHITECTURE_KEYWORDS);
  const forgeSignal = countKeywordHits(requestText, FORGE_KEYWORDS);
  const transformationSignal = countKeywordHits(requestText, TRANSFORMATION_KEYWORDS);
  const runtimeSignal =
    forgeSignal +
    (request.source_type && RUNTIME_SOURCE_TYPES.has(request.source_type) ? 2 : 0);
  const structuralSignal =
    architectureSignal +
    (request.source_type && STRUCTURAL_SOURCE_TYPES.has(request.source_type) ? 1 : 0);

  const trackScores: Record<DiscoveryRoutingTrack, number> = {
    discovery:
      discoverySignal * 3 +
      (request.source_type === "internal-signal" ? 2 : 0) +
      (matchedGap?.next_slice_track === "discovery" ? 4 : 0),
    architecture:
      structuralSignal * 3 +
      (matchedGap?.next_slice_track === "architecture" ? 4 : 0),
    forge:
      runtimeSignal * 3 +
      transformationSignal * 2 +
      (matchedGap?.next_slice_track === "forge" ? 4 : 0),
  };

  return {
    trackScores,
    transformationSignal: clampInt(transformationSignal, 0, 5),
    runtimeSignal: clampInt(runtimeSignal, 0, 5),
  };
}

function deriveRecommendedTrack(trackScores: Record<DiscoveryRoutingTrack, number>) {
  return (Object.entries(trackScores).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  })[0]?.[0] ?? "discovery") as DiscoveryRoutingTrack;
}

function deriveAmbiguityPenalty(trackScores: Record<DiscoveryRoutingTrack, number>) {
  const sortedScores = Object.values(trackScores).sort((left, right) => right - left);
  if (sortedScores.length < 2) {
    return 0;
  }
  const difference = sortedScores[0] - sortedScores[1];
  if (difference >= 4) return 0;
  if (difference >= 2) return 1;
  return 2;
}

function deriveConfidence(
  topTrackScore: number,
  ambiguityPenalty: number,
  routeConflict: boolean,
): DiscoveryMissionRoutingConfidence {
  if (!routeConflict && ambiguityPenalty === 0 && topTrackScore >= 10) {
    return "high";
  }
  if (ambiguityPenalty <= 1 && topTrackScore >= 6) {
    return "medium";
  }
  return "low";
}

function deriveRecommendedShape(
  request: DiscoverySubmissionRequest,
  recommendedTrack: DiscoveryRoutingTrack,
  confidence: DiscoveryMissionRoutingConfidence,
  matchedGap: DiscoveryGapWorklistItem | null,
): DiscoverySubmissionShape {
  const explicitShape = request.record_shape;
  if (
    explicitShape === "queue_only" ||
    explicitShape === "fast_path" ||
    explicitShape === "split_case"
  ) {
    return explicitShape;
  }

  if (request.case_record) return "split_case";
  if (request.fast_path) return "fast_path";

  if (confidence === "high" && matchedGap) {
    if (recommendedTrack === "architecture") {
      return "split_case";
    }
    return "fast_path";
  }

  if (confidence === "medium" && recommendedTrack !== "discovery") {
    return "fast_path";
  }

  return "queue_only";
}

export function assessDiscoveryMissionRouting(input: {
  request: DiscoverySubmissionRequest;
  gaps: CapabilityGapRecord[];
  activeMissionMarkdown: string;
  intakeQueueEntries?: DiscoveryQueueEntry[];
}): DiscoveryMissionRoutingAssessment {
  const requestText = flattenRequestText(input.request);
  const worklist = generateDiscoveryGapWorklist({
    updatedAt: "assessment",
    gaps: input.gaps,
    intakeQueueEntries: input.intakeQueueEntries ?? [],
    activeMissionMarkdown: input.activeMissionMarkdown,
  });
  const matchedGap = findMatchedGap(input.request, worklist.items, requestText);
  const missionFit = deriveMissionFit(requestText, input.activeMissionMarkdown);
  const gapAlignment = matchedGap
    ? clampInt(Math.ceil(matchedGap.priority_score / 20), 0, 5)
    : 0;
  const { trackScores, transformationSignal, runtimeSignal } = deriveTrackScores(
    input.request,
    requestText,
    matchedGap,
  );
  const recommendedTrack = deriveRecommendedTrack(trackScores);
  const ambiguityPenalty = deriveAmbiguityPenalty(trackScores);
  const explicitRouteDestination = deriveExplicitRouteDestination(input.request);
  const routeConflict =
    explicitRouteDestination !== null && explicitRouteDestination !== recommendedTrack;
  const topTrackScore = trackScores[recommendedTrack];
  const total =
    missionFit * 4 +
    gapAlignment * 5 +
    topTrackScore +
    transformationSignal -
    ambiguityPenalty * 4;
  const missionPriorityScore = clampInt(total, 0, 100);
  const confidence = deriveConfidence(topTrackScore, ambiguityPenalty, routeConflict);
  const recommendedRecordShape = deriveRecommendedShape(
    input.request,
    recommendedTrack,
    confidence,
    matchedGap,
  );
  const needsHumanReview =
    routeConflict ||
    confidence === "low" ||
    matchedGap === null ||
    recommendedRecordShape === "queue_only";

  const rationale: string[] = [];
  if (matchedGap) {
    rationale.push(
      `Matched open gap ${matchedGap.gap_id} (rank ${matchedGap.worklist_rank}) as the closest current mission pressure.`,
    );
  } else {
    rationale.push(
      "No unresolved gap matched strongly enough, so the assessment relied on mission-fit and track-signal scoring.",
    );
  }
  rationale.push(
    `Recommended ${recommendedTrack} because its track score (${trackScores[recommendedTrack]}) exceeded the alternatives.`,
  );
  if (transformationSignal > 0) {
    rationale.push(
      `Transformation signal is present (${transformationSignal}/5), which strengthens Forge-style behavior-preserving work.`,
    );
  }
  if (routeConflict && explicitRouteDestination) {
    rationale.push(
      `Explicit route ${explicitRouteDestination} conflicts with the computed recommendation and should be reviewed by a human.`,
    );
  }
  if (recommendedRecordShape === "fast_path") {
    rationale.push(
      "Fast-path is recommended because the route appears bounded enough to avoid a full split-case path.",
    );
  } else if (recommendedRecordShape === "split_case") {
    rationale.push(
      "Split-case is recommended because the candidate looks structural or ambiguous enough to benefit from fuller Discovery records.",
    );
  } else {
    rationale.push(
      "Queue-only is recommended because the candidate still needs more routing clarity before record expansion.",
    );
  }

  return {
    recommended_track: recommendedTrack,
    recommended_record_shape: recommendedRecordShape,
    mission_priority_score: missionPriorityScore,
    confidence,
    matched_gap_id: matchedGap?.gap_id ?? null,
    matched_gap_rank: matchedGap?.worklist_rank ?? null,
    explicit_route_destination: explicitRouteDestination,
    route_conflict: routeConflict,
    needs_human_review: needsHumanReview,
    score_breakdown: {
      mission_fit: missionFit,
      gap_alignment: gapAlignment,
      track_scores: trackScores,
      transformation_signal: transformationSignal,
      runtime_signal: runtimeSignal,
      ambiguity_penalty: ambiguityPenalty,
      total: missionPriorityScore,
    },
    rationale,
  };
}
