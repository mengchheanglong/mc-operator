// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/architecture-adoption-resolution.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import type {
  ArchitectureReviewResolution,
} from "./architecture-review-resolution";

export type ArchitectureUsefulnessLevel = "direct" | "structural" | "meta";
export type ArchitectureArtifactType =
  | "contract"
  | "schema"
  | "template"
  | "policy"
  | "reference-pattern"
  | "shared-lib"
  | "doctrine-update";
export type ArchitectureValueShape =
  | "interface_or_handoff"
  | "data_shape"
  | "working_document"
  | "behavior_rule"
  | "design_pattern"
  | "executable_logic"
  | "operating_model_change";
export type ArchitectureCompletionStatus =
  | "product_materialized"
  | "product_partial"
  | "doc_only_or_planned"
  | "routed_out_of_architecture"
  | "reference_only";
export type ArchitectureAdoptionVerdict =
  | "adopt"
  | "stay_experimental"
  | "hand_off_to_forge"
  | "defer"
  | "reject";
export type ArchitectureSelfImprovementCategory =
  | "analysis_quality"
  | "extraction_quality"
  | "adaptation_quality"
  | "improvement_quality"
  | "routing_quality"
  | "evaluation_quality"
  | "handoff_quality";

export type ArchitectureAdoptionReadinessCheck = {
  source_analysis_complete: boolean;
  adaptation_decision_complete: boolean;
  adaptation_quality_acceptable: boolean;
  delta_evidence_present: boolean;
  no_unresolved_baggage: boolean;
};

export type ArchitectureAdoptionInput = {
  sourceId: string;
  usefulnessLevel: ArchitectureUsefulnessLevel;
  valueShape: ArchitectureValueShape;
  readinessCheck: ArchitectureAdoptionReadinessCheck;
  adaptationQuality: "strong" | "adequate" | "weak" | "skipped";
  improvementQuality: "strong" | "adequate" | "weak" | "skipped";
  productArtifactMaterialized?: boolean;
  keepAsReferenceOnly?: boolean;
  dependsOnUnadoptedMechanism?: boolean;
  proofExecuted?: boolean;
  targetArtifactClarified?: boolean;
  conflictsWithExistingArtifact?: boolean;
  remainingValueIsRuntimeCapability?: boolean;
  requiresHostIntegration?: boolean;
  architectureValueCaptured?: boolean;
  explicitForgeHandoffReady?: boolean;
  valuableWithoutRuntimeSurface: boolean;
  metaSelfImprovementCategory?: ArchitectureSelfImprovementCategory;
  reviewResolution?: ArchitectureReviewResolution;
};

export type ArchitectureAdoptionResolution = {
  sourceId: string;
  artifactType: ArchitectureArtifactType;
  readinessPassed: boolean;
  reviewPassed: boolean;
  forgeThresholdCheck: string;
  verdict: ArchitectureAdoptionVerdict;
  completionStatus: ArchitectureCompletionStatus;
  requiredGaps: string[];
  rationale: string;
  forgeHandoff: {
    required: boolean;
    rationale: string | null;
  };
  reviewTrace: {
    score: number | null;
    result: "approved" | "rejected" | "not_run";
    outcome:
      | "promote_to_decision"
      | "accept_with_follow_up"
      | "resume_experiment"
      | "blocked_recovery"
      | "not_run";
  };
};

const VALUE_SHAPE_ARTIFACT_TYPES: Record<
  ArchitectureValueShape,
  ArchitectureArtifactType
> = {
  interface_or_handoff: "contract",
  data_shape: "schema",
  working_document: "template",
  behavior_rule: "policy",
  design_pattern: "reference-pattern",
  executable_logic: "shared-lib",
  operating_model_change: "doctrine-update",
};

function dedupe(items: string[]) {
  return [...new Set(items)];
}

export function resolveArchitectureArtifactType(
  valueShape: ArchitectureValueShape,
): ArchitectureArtifactType {
  return VALUE_SHAPE_ARTIFACT_TYPES[valueShape];
}

function collectReadinessGaps(input: ArchitectureAdoptionInput) {
  const gaps: string[] = [];
  const readiness = input.readinessCheck;

  if (!readiness.source_analysis_complete) {
    gaps.push("Source analysis must exist and reach proceed_to_extraction before adoption.");
  }
  if (!readiness.adaptation_decision_complete) {
    gaps.push("Adaptation decision must exist and reach proceed_to_proof before adoption.");
  }
  if (!readiness.adaptation_quality_acceptable) {
    gaps.push("Adaptation quality must be strong or adequate before adoption.");
  }
  if (!readiness.delta_evidence_present) {
    gaps.push("Original-vs-adapted and original-vs-improved delta evidence must be substantive.");
  }
  if (!readiness.no_unresolved_baggage) {
    gaps.push("All baggage must be explicitly excluded or justified before adoption.");
  }
  if (input.adaptationQuality === "weak" || input.adaptationQuality === "skipped") {
    gaps.push("Adaptation quality cannot be weak or skipped without explicit justification.");
  }
  if (input.dependsOnUnadoptedMechanism) {
    gaps.push("The mechanism depends on another mechanism that has not yet been adopted.");
  }
  if (input.proofExecuted === false) {
    gaps.push("Required proof has not been executed yet.");
  }
  if (input.targetArtifactClarified === false) {
    gaps.push("The target artifact type is still unclear after the selection matrix.");
  }
  if (input.conflictsWithExistingArtifact) {
    gaps.push("The mechanism conflicts with an existing adopted contract, schema, or policy.");
  }
  if (input.usefulnessLevel === "meta" && !input.metaSelfImprovementCategory) {
    gaps.push("Meta-useful adoptions must declare a self-improvement category.");
  }

  return dedupe(gaps);
}

function shouldHandOffToForge(input: ArchitectureAdoptionInput) {
  return Boolean(
    input.remainingValueIsRuntimeCapability
      && input.requiresHostIntegration
      && input.architectureValueCaptured
      && input.explicitForgeHandoffReady,
  );
}

function resolveCompletionStatus(
  verdict: ArchitectureAdoptionVerdict,
  artifactType: ArchitectureArtifactType,
  input: ArchitectureAdoptionInput,
): ArchitectureCompletionStatus {
  if (verdict === "hand_off_to_forge") {
    return "routed_out_of_architecture";
  }
  if (verdict === "reject") {
    return input.keepAsReferenceOnly ? "reference_only" : "doc_only_or_planned";
  }
  if (verdict !== "adopt") {
    return "doc_only_or_planned";
  }
  if (artifactType === "reference-pattern" && input.keepAsReferenceOnly) {
    return "reference_only";
  }
  return input.productArtifactMaterialized === false
    ? "product_partial"
    : "product_materialized";
}

function buildForgeThresholdCheck(input: ArchitectureAdoptionInput) {
  return input.valuableWithoutRuntimeSurface
    ? "yes - the mechanism is still valuable without a runtime surface, so Architecture should retain product-owned value"
    : "no - the remaining value depends on runtime operationalization and should hand off once Architecture-retained value is captured";
}

export function resolveArchitectureAdoption(
  input: ArchitectureAdoptionInput,
): ArchitectureAdoptionResolution {
  const artifactType = resolveArchitectureArtifactType(input.valueShape);
  const readinessGaps = collectReadinessGaps(input);
  const reviewResult = input.reviewResolution?.reviewResult ?? "approved";
  const reviewPassed = reviewResult === "approved";
  const reviewRequiredChanges = input.reviewResolution?.requiredChanges ?? [];
  const forgeThresholdCheck = buildForgeThresholdCheck(input);

  if (!reviewPassed) {
    const requiredGaps = dedupe([...readinessGaps, ...reviewRequiredChanges]);
    return {
      sourceId: input.sourceId,
      artifactType,
      readinessPassed: readinessGaps.length === 0,
      reviewPassed: false,
      forgeThresholdCheck,
      verdict: "stay_experimental",
      completionStatus: "doc_only_or_planned",
      requiredGaps,
      rationale:
        "Architecture review did not clear the candidate; keep the mechanism in experiments until the review-required changes are closed.",
      forgeHandoff: {
        required: false,
        rationale: null,
      },
      reviewTrace: {
        score: input.reviewResolution?.reviewScore ?? null,
        result: input.reviewResolution?.reviewResult ?? "not_run",
        outcome: input.reviewResolution?.lifecycleFeedback.outcome ?? "not_run",
      },
    };
  }

  if (readinessGaps.length > 0) {
    return {
      sourceId: input.sourceId,
      artifactType,
      readinessPassed: false,
      reviewPassed: true,
      forgeThresholdCheck,
      verdict: "stay_experimental",
      completionStatus: "doc_only_or_planned",
      requiredGaps: readinessGaps,
      rationale:
        "The mechanism is not adoption-ready yet; keep it experimental until readiness and evidence gaps are closed.",
      forgeHandoff: {
        required: false,
        rationale: null,
      },
      reviewTrace: {
        score: input.reviewResolution?.reviewScore ?? null,
        result: input.reviewResolution?.reviewResult ?? "not_run",
        outcome: input.reviewResolution?.lifecycleFeedback.outcome ?? "not_run",
      },
    };
  }

  if (shouldHandOffToForge(input)) {
    return {
      sourceId: input.sourceId,
      artifactType,
      readinessPassed: true,
      reviewPassed: true,
      forgeThresholdCheck,
      verdict: "hand_off_to_forge",
      completionStatus: "routed_out_of_architecture",
      requiredGaps: [],
      rationale:
        "Architecture has retained its product-owned value and the remaining work is runtime capability that belongs to Forge.",
      forgeHandoff: {
        required: true,
        rationale:
          "Remaining value is callable/runtime capability that requires host integration and explicit Forge follow-up.",
      },
      reviewTrace: {
        score: input.reviewResolution?.reviewScore ?? null,
        result: input.reviewResolution?.reviewResult ?? "not_run",
        outcome: input.reviewResolution?.lifecycleFeedback.outcome ?? "not_run",
      },
    };
  }

  return {
    sourceId: input.sourceId,
    artifactType,
    readinessPassed: true,
    reviewPassed: true,
    forgeThresholdCheck,
    verdict: "adopt",
    completionStatus: resolveCompletionStatus("adopt", artifactType, input),
    requiredGaps: reviewRequiredChanges,
    rationale:
      "The mechanism passed review, met adoption readiness, and remains valuable as Directive-owned Architecture output.",
    forgeHandoff: {
      required: input.usefulnessLevel === "direct",
      rationale:
        input.usefulnessLevel === "direct"
          ? "Direct-useful mechanisms should keep an explicit Forge handoff plan even when Architecture adopts the retained structural value."
          : null,
    },
    reviewTrace: {
      score: input.reviewResolution?.reviewScore ?? null,
      result: input.reviewResolution?.reviewResult ?? "not_run",
      outcome: input.reviewResolution?.lifecycleFeedback.outcome ?? "not_run",
    },
  };
}
