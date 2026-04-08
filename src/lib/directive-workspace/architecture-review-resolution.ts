// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/architecture-review-resolution.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import {
  assertDirectiveLifecycleTransitionAllowed,
  resolveDirectiveReviewFeedback,
  type DirectiveLifecycleRole,
  type DirectiveReviewFeedbackPlan,
} from "./lifecycle-review-feedback";

export type ArchitectureReviewCheckId =
  | "state_visibility_check"
  | "rollback_check"
  | "scope_isolation_check"
  | "validation_link_check"
  | "ownership_boundary_check"
  | "packet_consumption_check"
  | "artifact_evidence_continuity_check";

export type ArchitectureReviewCheckStatus =
  | "pass"
  | "warning"
  | "fail"
  | "not_applicable";

export type ArchitectureReviewAntiPatternId =
  | "vague_status_labels"
  | "concealed_gate_failures_or_degraded_states"
  | "missing_validation_method"
  | "blurred_forge_vs_architecture_ownership"
  | "unbounded_rewrite_pressure"
  | "ignored_reusable_packet_inputs"
  | "broken_artifact_evidence_continuity";

export type ArchitectureReviewResolutionInput = {
  candidateId: string;
  recoveryOwnerAssigned?: boolean;
  blockedReason?: string;
  resumeTarget?: "analyzed" | "experimenting";
  checks: Partial<Record<ArchitectureReviewCheckId, ArchitectureReviewCheckStatus>>;
  antiPatterns?: Partial<Record<ArchitectureReviewAntiPatternId, boolean>>;
};

export type ArchitectureReviewTransitionRequest = {
  from: "evaluated";
  to: DirectiveReviewFeedbackPlan["recommendedNextState"];
  role: DirectiveReviewFeedbackPlan["requiredRole"];
};

export type ArchitectureReviewResolution = {
  candidateId: string;
  reviewScore: 1 | 2 | 3 | 4 | 5;
  reviewResult: "approved" | "rejected";
  failingChecks: ArchitectureReviewCheckId[];
  warningChecks: ArchitectureReviewCheckId[];
  missingChecks: ArchitectureReviewCheckId[];
  triggeredAntiPatterns: ArchitectureReviewAntiPatternId[];
  requiredChanges: string[];
  lifecycleFeedback: DirectiveReviewFeedbackPlan;
  transitionRequest: ArchitectureReviewTransitionRequest;
};

type WeightedCheck = {
  failurePenalty: number;
  warningPenalty: number;
  criticalFailure: boolean;
  changeHint: string;
};

const ARCHITECTURE_REVIEW_CHECKS: ArchitectureReviewCheckId[] = [
  "state_visibility_check",
  "rollback_check",
  "scope_isolation_check",
  "validation_link_check",
  "ownership_boundary_check",
  "packet_consumption_check",
  "artifact_evidence_continuity_check",
];

const ARCHITECTURE_REVIEW_CHECK_WEIGHTS: Record<
  ArchitectureReviewCheckId,
  WeightedCheck
> = {
  state_visibility_check: {
    failurePenalty: 2,
    warningPenalty: 1,
    criticalFailure: true,
    changeHint: "Make lifecycle state, blockers, degraded modes, and next actions explicit.",
  },
  rollback_check: {
    failurePenalty: 2,
    warningPenalty: 1,
    criticalFailure: true,
    changeHint: "Add explicit rollback or no-op reasoning before accepting the slice.",
  },
  scope_isolation_check: {
    failurePenalty: 1,
    warningPenalty: 1,
    criticalFailure: false,
    changeHint: "Rebound the proposal so the requested change stays isolated from unrelated redesign.",
  },
  validation_link_check: {
    failurePenalty: 2,
    warningPenalty: 1,
    criticalFailure: true,
    changeHint: "Attach a concrete validation method or state clearly why validation is not yet applicable.",
  },
  ownership_boundary_check: {
    failurePenalty: 2,
    warningPenalty: 1,
    criticalFailure: true,
    changeHint: "Clarify whether the value stays in Architecture or should hand off to Forge.",
  },
  packet_consumption_check: {
    failurePenalty: 1,
    warningPenalty: 1,
    criticalFailure: false,
    changeHint: "Consume an existing mechanism or synthesis packet before reopening full source history.",
  },
  artifact_evidence_continuity_check: {
    failurePenalty: 1,
    warningPenalty: 1,
    criticalFailure: false,
    changeHint: "Keep stage-boundary artifacts coupled to evidence, citation, or proof-support artifacts.",
  },
};

const ARCHITECTURE_REVIEW_ANTI_PATTERN_HINTS: Record<
  ArchitectureReviewAntiPatternId,
  { penalty: number; fatal: boolean; changeHint: string }
> = {
  vague_status_labels: {
    penalty: 1,
    fatal: false,
    changeHint: "Replace vague status labels with explicit decision-meaningful state language.",
  },
  concealed_gate_failures_or_degraded_states: {
    penalty: 2,
    fatal: true,
    changeHint: "Surface hidden gate failures or degraded states directly in the review outcome.",
  },
  missing_validation_method: {
    penalty: 2,
    fatal: true,
    changeHint: "State how the proposal will be validated before it can advance.",
  },
  blurred_forge_vs_architecture_ownership: {
    penalty: 2,
    fatal: true,
    changeHint: "Split Architecture-retained value from runtime/Forge-owned value explicitly.",
  },
  unbounded_rewrite_pressure: {
    penalty: 1,
    fatal: false,
    changeHint: "Reduce rewrite pressure and return to one bounded reviewable slice.",
  },
  ignored_reusable_packet_inputs: {
    penalty: 1,
    fatal: false,
    changeHint: "Use retained mechanism or synthesis packets instead of repeating full historical analysis.",
  },
  broken_artifact_evidence_continuity: {
    penalty: 2,
    fatal: true,
    changeHint: "Reconnect the review artifact to the evidence/proof chain before accepting it.",
  },
};

function dedupe(items: string[]) {
  return [...new Set(items)];
}

function toReviewScore(totalPenalty: number): 1 | 2 | 3 | 4 | 5 {
  if (totalPenalty <= 0) return 5;
  if (totalPenalty <= 2) return 4;
  if (totalPenalty <= 4) return 3;
  if (totalPenalty <= 6) return 2;
  return 1;
}

function resolveRequiredRoleTransition(
  feedback: DirectiveReviewFeedbackPlan,
): ArchitectureReviewTransitionRequest {
  const request: ArchitectureReviewTransitionRequest = {
    from: "evaluated",
    to: feedback.recommendedNextState,
    role: feedback.requiredRole,
  };
  assertDirectiveLifecycleTransitionAllowed(request);
  return request;
}

function collectFailingChecks(
  checks: Partial<Record<ArchitectureReviewCheckId, ArchitectureReviewCheckStatus>>,
) {
  const failingChecks: ArchitectureReviewCheckId[] = [];
  const warningChecks: ArchitectureReviewCheckId[] = [];
  const missingChecks: ArchitectureReviewCheckId[] = [];
  const changeHints: string[] = [];
  let penalty = 0;
  let hasCriticalFailure = false;

  for (const checkId of ARCHITECTURE_REVIEW_CHECKS) {
    const status = checks[checkId];
    const weights = ARCHITECTURE_REVIEW_CHECK_WEIGHTS[checkId];

    if (status === undefined) {
      missingChecks.push(checkId);
      failingChecks.push(checkId);
      penalty += weights.failurePenalty;
      changeHints.push(weights.changeHint);
      if (weights.criticalFailure) {
        hasCriticalFailure = true;
      }
      continue;
    }

    if (status === "fail") {
      failingChecks.push(checkId);
      penalty += weights.failurePenalty;
      changeHints.push(weights.changeHint);
      if (weights.criticalFailure) {
        hasCriticalFailure = true;
      }
      continue;
    }

    if (status === "warning") {
      warningChecks.push(checkId);
      penalty += weights.warningPenalty;
      changeHints.push(weights.changeHint);
    }
  }

  return {
    failingChecks,
    warningChecks,
    missingChecks,
    changeHints,
    penalty,
    hasCriticalFailure,
  };
}

function collectTriggeredAntiPatterns(
  antiPatterns: Partial<Record<ArchitectureReviewAntiPatternId, boolean>> | undefined,
) {
  const triggeredAntiPatterns = Object.entries(antiPatterns || {})
    .filter((entry): entry is [ArchitectureReviewAntiPatternId, boolean] => entry[1] === true)
    .map(([id]) => id);

  const changeHints = triggeredAntiPatterns.map(
    (id) => ARCHITECTURE_REVIEW_ANTI_PATTERN_HINTS[id].changeHint,
  );
  const penalty = triggeredAntiPatterns.reduce(
    (sum, id) => sum + ARCHITECTURE_REVIEW_ANTI_PATTERN_HINTS[id].penalty,
    0,
  );
  const hasFatalAntiPattern = triggeredAntiPatterns.some(
    (id) => ARCHITECTURE_REVIEW_ANTI_PATTERN_HINTS[id].fatal,
  );

  return {
    triggeredAntiPatterns,
    changeHints,
    penalty,
    hasFatalAntiPattern,
  };
}

export function resolveArchitectureReview(
  input: ArchitectureReviewResolutionInput,
): ArchitectureReviewResolution {
  const checkSummary = collectFailingChecks(input.checks);
  const antiPatternSummary = collectTriggeredAntiPatterns(input.antiPatterns);
  const reviewScore = toReviewScore(
    checkSummary.penalty + antiPatternSummary.penalty,
  );
  const reviewResult: "approved" | "rejected" =
    checkSummary.hasCriticalFailure
    || antiPatternSummary.hasFatalAntiPattern
    || reviewScore <= 2
      ? "rejected"
      : "approved";

  const lifecycleFeedback = resolveDirectiveReviewFeedback({
    reviewResult,
    reviewScore,
    recoveryOwnerAssigned: input.recoveryOwnerAssigned,
    blockedReason: input.blockedReason,
    resumeTarget: input.resumeTarget,
  });

  return {
    candidateId: input.candidateId,
    reviewScore,
    reviewResult,
    failingChecks: checkSummary.failingChecks,
    warningChecks: checkSummary.warningChecks,
    missingChecks: checkSummary.missingChecks,
    triggeredAntiPatterns: antiPatternSummary.triggeredAntiPatterns,
    requiredChanges: dedupe([
      ...checkSummary.changeHints,
      ...antiPatternSummary.changeHints,
    ]),
    lifecycleFeedback,
    transitionRequest: resolveRequiredRoleTransition(lifecycleFeedback),
  };
}

export function getArchitectureReviewRequiredChecks() {
  return [...ARCHITECTURE_REVIEW_CHECKS];
}

export function getArchitectureReviewTransitionRole(
  feedback: DirectiveReviewFeedbackPlan,
): DirectiveLifecycleRole {
  return feedback.requiredRole;
}
