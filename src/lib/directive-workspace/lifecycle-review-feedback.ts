// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/lifecycle-review-feedback.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
export type DirectiveLifecycleState =
  | "intake"
  | "analyzed"
  | "experimenting"
  | "evaluated"
  | "decided"
  | "integrated"
  | "blocked";

export type DirectiveLifecycleRole =
  | "operator"
  | "reviewer"
  | "evaluator"
  | "decision_owner"
  | "integration_owner"
  | "recovery_patrol"
  | "planner";

export type DirectiveReviewResult = "approved" | "rejected";
export type DirectiveReviewScore = 1 | 2 | 3 | 4 | 5;
export type DirectiveReviewQualityBand =
  | "strong_pass"
  | "acceptable"
  | "mixed"
  | "weak"
  | "fail";
export type DirectiveReviewOutcome =
  | "promote_to_decision"
  | "accept_with_follow_up"
  | "resume_experiment"
  | "blocked_recovery";
export type DirectiveRecoveryStep = "detect" | "reassign" | "resume";

export type DirectiveLifecycleTransitionRequest = {
  from: DirectiveLifecycleState;
  to: DirectiveLifecycleState;
  role: DirectiveLifecycleRole;
};

export type DirectiveLifecycleTransitionGate = {
  from: DirectiveLifecycleState;
  to: DirectiveLifecycleState;
  allowedRoles: DirectiveLifecycleRole[];
};

export type DirectiveBlockedRecoveryPlan = {
  blockedReason: string;
  resumeTarget: Extract<DirectiveLifecycleState, "analyzed" | "experimenting">;
  steps: Array<{
    step: DirectiveRecoveryStep;
    owner: Extract<DirectiveLifecycleRole, "recovery_patrol" | "planner">;
    description: string;
  }>;
};

export type DirectiveReviewFeedbackInput = {
  reviewResult: DirectiveReviewResult;
  reviewScore: DirectiveReviewScore;
  recoveryOwnerAssigned?: boolean;
  blockedReason?: string;
  resumeTarget?: Extract<DirectiveLifecycleState, "analyzed" | "experimenting">;
};

export type DirectiveReviewFeedbackPlan = {
  scoreDelta: number;
  qualityBand: DirectiveReviewQualityBand;
  degradedQuality: boolean;
  shouldRecordRecoveryFollowUp: boolean;
  outcome: DirectiveReviewOutcome;
  recommendedNextState: Extract<
    DirectiveLifecycleState,
    "decided" | "experimenting" | "blocked"
  >;
  requiredRole: Extract<
    DirectiveLifecycleRole,
    "decision_owner" | "planner" | "recovery_patrol"
  >;
  recoveryPlan?: DirectiveBlockedRecoveryPlan;
};

export const DIRECTIVE_LIFECYCLE_TRANSITIONS: Record<
  DirectiveLifecycleState,
  DirectiveLifecycleState[]
> = {
  intake: ["analyzed"],
  analyzed: ["experimenting"],
  experimenting: ["evaluated", "blocked"],
  evaluated: ["decided", "blocked", "experimenting"],
  decided: ["integrated", "blocked"],
  integrated: [],
  blocked: ["analyzed", "experimenting"],
};

export const DIRECTIVE_LIFECYCLE_ROLE_GATES: DirectiveLifecycleTransitionGate[] = [
  { from: "intake", to: "analyzed", allowedRoles: ["operator"] },
  { from: "analyzed", to: "experimenting", allowedRoles: ["operator"] },
  { from: "experimenting", to: "evaluated", allowedRoles: ["reviewer", "evaluator"] },
  { from: "evaluated", to: "decided", allowedRoles: ["decision_owner"] },
  { from: "decided", to: "integrated", allowedRoles: ["integration_owner"] },
  { from: "experimenting", to: "blocked", allowedRoles: ["recovery_patrol"] },
  { from: "evaluated", to: "blocked", allowedRoles: ["recovery_patrol"] },
  { from: "decided", to: "blocked", allowedRoles: ["recovery_patrol"] },
  { from: "blocked", to: "analyzed", allowedRoles: ["planner"] },
  { from: "blocked", to: "experimenting", allowedRoles: ["planner"] },
  { from: "evaluated", to: "experimenting", allowedRoles: ["planner"] },
];

export const DIRECTIVE_REVIEW_SCORE_DELTAS: Record<DirectiveReviewScore, number> = {
  1: -2,
  2: -1,
  3: 0,
  4: 1,
  5: 2,
};

function toQualityBand(score: DirectiveReviewScore): DirectiveReviewQualityBand {
  if (score === 5) {
    return "strong_pass";
  }
  if (score === 4) {
    return "acceptable";
  }
  if (score === 3) {
    return "mixed";
  }
  if (score === 2) {
    return "weak";
  }
  return "fail";
}

function normalizeBlockedReason(value: string | undefined) {
  const normalized = String(value || "").trim();
  return normalized || "review rejected and no explicit recovery owner was assigned";
}

export function getDirectiveAllowedLifecycleTargets(
  state: DirectiveLifecycleState,
) {
  return [...DIRECTIVE_LIFECYCLE_TRANSITIONS[state]];
}

export function isDirectiveLifecycleTransitionAllowed(
  request: DirectiveLifecycleTransitionRequest,
) {
  const allowedTargets = DIRECTIVE_LIFECYCLE_TRANSITIONS[request.from];
  if (!allowedTargets.includes(request.to)) {
    return false;
  }

  const gate = DIRECTIVE_LIFECYCLE_ROLE_GATES.find(
    (item) => item.from === request.from && item.to === request.to,
  );
  if (!gate) {
    return false;
  }

  return gate.allowedRoles.includes(request.role);
}

export function assertDirectiveLifecycleTransitionAllowed(
  request: DirectiveLifecycleTransitionRequest,
) {
  if (isDirectiveLifecycleTransitionAllowed(request)) {
    return;
  }

  throw new Error(
    `invalid_transition: ${request.role} cannot move ${request.from} -> ${request.to}`,
  );
}

export function getDirectiveReviewScoreDelta(score: DirectiveReviewScore) {
  return DIRECTIVE_REVIEW_SCORE_DELTAS[score];
}

export function buildDirectiveBlockedRecoveryPlan(input?: {
  blockedReason?: string;
  resumeTarget?: Extract<DirectiveLifecycleState, "analyzed" | "experimenting">;
}): DirectiveBlockedRecoveryPlan {
  const resumeTarget = input?.resumeTarget || "experimenting";
  const blockedReason = normalizeBlockedReason(input?.blockedReason);

  return {
    blockedReason,
    resumeTarget,
    steps: [
      {
        step: "detect",
        owner: "recovery_patrol",
        description: "Record the blocked condition and capture the blocking reason explicitly.",
      },
      {
        step: "reassign",
        owner: "planner",
        description:
          "Assign a recovery owner or planner decision before the item returns to active flow.",
      },
      {
        step: "resume",
        owner: "planner",
        description: `Return the item to ${resumeTarget} with explicit recovery rationale.`,
      },
    ],
  };
}

export function resolveDirectiveReviewFeedback(
  input: DirectiveReviewFeedbackInput,
): DirectiveReviewFeedbackPlan {
  const qualityBand = toQualityBand(input.reviewScore);
  const scoreDelta = getDirectiveReviewScoreDelta(input.reviewScore);
  const degradedQuality = input.reviewScore <= 3;
  const shouldRecordRecoveryFollowUp =
    input.reviewResult === "rejected" || degradedQuality;

  if (input.reviewResult === "approved") {
    return {
      scoreDelta,
      qualityBand,
      degradedQuality,
      shouldRecordRecoveryFollowUp,
      outcome: degradedQuality
        ? "accept_with_follow_up"
        : "promote_to_decision",
      recommendedNextState: "decided",
      requiredRole: "decision_owner",
    };
  }

  if (input.recoveryOwnerAssigned) {
    return {
      scoreDelta,
      qualityBand,
      degradedQuality,
      shouldRecordRecoveryFollowUp: true,
      outcome: "resume_experiment",
      recommendedNextState: "experimenting",
      requiredRole: "planner",
    };
  }

  return {
    scoreDelta,
    qualityBand,
    degradedQuality,
    shouldRecordRecoveryFollowUp: true,
    outcome: "blocked_recovery",
    recommendedNextState: "blocked",
    requiredRole: "recovery_patrol",
    recoveryPlan: buildDirectiveBlockedRecoveryPlan({
      blockedReason: input.blockedReason,
      resumeTarget: input.resumeTarget,
    }),
  };
}
