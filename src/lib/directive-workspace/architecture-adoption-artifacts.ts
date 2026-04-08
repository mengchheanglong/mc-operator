import {
  resolveArchitectureAdoption,
  type ArchitectureAdoptionInput,
  type ArchitectureAdoptionReadinessCheck,
  type ArchitectureAdoptionResolution,
  type ArchitectureAdoptionVerdict,
  type ArchitectureArtifactType,
  type ArchitectureCompletionStatus,
  type ArchitectureSelfImprovementCategory,
  type ArchitectureUsefulnessLevel,
} from "./architecture-adoption-resolution";
import {
  DIRECTIVE_ARCHITECTURE_ADOPTION_DECISION_FORMAT,
  DIRECTIVE_ARTIFACT_UNSET,
  mergeDirectiveArtifactSections,
} from "./architecture-adoption-decision-envelope";

export type ArchitectureSelfImprovementVerificationMethod =
  | "next_cycle_comparison"
  | "structural_inspection"
  | "metric_tracking"
  | "retrospective_judgment";

export type ArchitectureSelfImprovementVerificationResult =
  | "confirmed"
  | "partially_confirmed"
  | "not_confirmed"
  | "not_yet_verified";

export type DirectiveArchitectureSelfImprovementArtifact = {
  category: ArchitectureSelfImprovementCategory;
  claim: string;
  mechanism: string;
  baselineObservation: string;
  expectedEffect: string;
  verificationMethod: ArchitectureSelfImprovementVerificationMethod;
  verificationResult?: ArchitectureSelfImprovementVerificationResult;
  verificationDate?: string;
  verificationNotes?: string;
};

export type DirectiveArchitectureAdoptionDecisionArtifact = {
  decision_format: string;
  source_id: string;
  adoption_date: string;
  source_analysis_ref?: string;
  adaptation_decision_ref?: string;
  usefulness_level: ArchitectureUsefulnessLevel;
  readiness_check: ArchitectureAdoptionReadinessCheck;
  artifact_type: ArchitectureArtifactType;
  artifact_path: string;
  adaptation_quality: ArchitectureAdoptionInput["adaptationQuality"];
  improvement_quality?: ArchitectureAdoptionInput["improvementQuality"];
  forge_handoff?: {
    required: boolean;
    ref?: string;
    rationale?: string;
  };
  self_improvement?: {
    category: ArchitectureSelfImprovementCategory;
    claim: string;
    mechanism: string;
    baseline_observation: string;
    expected_effect: string;
    verification_method: ArchitectureSelfImprovementVerificationMethod;
    verification_result?: ArchitectureSelfImprovementVerificationResult;
    verification_date?: string;
    verification_notes?: string;
  };
  decision: {
    verdict: ArchitectureAdoptionVerdict;
    rationale: string;
    completion_status?: ArchitectureCompletionStatus;
    stay_experimental_reason?: string;
    forge_threshold_check?: string;
  };
};

export type DirectiveArchitectureAdoptionDecisionArtifactInput =
  ArchitectureAdoptionInput & {
    artifactPath: string;
    adoptionDate?: string;
    sourceAnalysisRef?: string;
    adaptationDecisionRef?: string;
    forgeHandoffRef?: string;
    selfImprovement?: DirectiveArchitectureSelfImprovementArtifact;
    adoptionResolution?: ArchitectureAdoptionResolution;
  };

const USEFULNESS_LEVELS = new Set<ArchitectureUsefulnessLevel>([
  "direct",
  "structural",
  "meta",
]);

const ARTIFACT_TYPES = new Set<ArchitectureArtifactType>([
  "contract",
  "schema",
  "template",
  "policy",
  "reference-pattern",
  "shared-lib",
  "doctrine-update",
]);

const QUALITY_LEVELS = new Set<ArchitectureAdoptionInput["adaptationQuality"]>([
  "strong",
  "adequate",
  "weak",
  "skipped",
]);

const DECISION_VERDICTS = new Set<ArchitectureAdoptionVerdict>([
  "adopt",
  "stay_experimental",
  "hand_off_to_forge",
  "defer",
  "reject",
]);

const COMPLETION_STATUSES = new Set<ArchitectureCompletionStatus>([
  "product_materialized",
  "product_partial",
  "doc_only_or_planned",
  "routed_out_of_architecture",
  "reference_only",
]);

const SELF_IMPROVEMENT_VERIFICATION_METHODS =
  new Set<ArchitectureSelfImprovementVerificationMethod>([
    "next_cycle_comparison",
    "structural_inspection",
    "metric_tracking",
    "retrospective_judgment",
  ]);

const SELF_IMPROVEMENT_VERIFICATION_RESULTS =
  new Set<ArchitectureSelfImprovementVerificationResult>([
    "confirmed",
    "partially_confirmed",
    "not_confirmed",
    "not_yet_verified",
  ]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveAdoptionDate(value?: string) {
  const candidate = (value || "").trim();
  return candidate || new Date().toISOString().slice(0, 10);
}

function buildStayExperimentalReason(
  resolution: ArchitectureAdoptionResolution,
) {
  if (resolution.verdict !== "stay_experimental") return undefined;
  if (resolution.requiredGaps.length > 0) {
    return resolution.requiredGaps.join("; ");
  }
  return resolution.rationale;
}

function buildForgeHandoff(
  input: DirectiveArchitectureAdoptionDecisionArtifactInput,
  resolution: ArchitectureAdoptionResolution,
) {
  const ref = (input.forgeHandoffRef || "").trim() || undefined;
  const rationale = resolution.forgeHandoff.rationale || undefined;

  if (!resolution.forgeHandoff.required && !ref && !rationale) {
    return undefined;
  }

  return mergeDirectiveArtifactSections({
    required: resolution.forgeHandoff.required,
    ref: ref ?? DIRECTIVE_ARTIFACT_UNSET,
    rationale: rationale ?? DIRECTIVE_ARTIFACT_UNSET,
  });
}

function buildSelfImprovement(
  input: DirectiveArchitectureAdoptionDecisionArtifactInput,
  resolution: ArchitectureAdoptionResolution,
) {
  const details = input.selfImprovement;
  if (!details) {
    if (input.usefulnessLevel === "meta" && resolution.verdict === "adopt") {
      throw new Error(
        "Meta-useful adopted Architecture decisions must include a self-improvement block.",
      );
    }
    return undefined;
  }

  if (input.usefulnessLevel !== "meta") {
    throw new Error(
      "Self-improvement evidence is only valid for meta-useful Architecture decisions.",
    );
  }

  if (
    input.metaSelfImprovementCategory
    && details.category !== input.metaSelfImprovementCategory
  ) {
    throw new Error(
      "Self-improvement category must match the meta self-improvement category declared for adoption.",
    );
  }

  return mergeDirectiveArtifactSections({
    category: details.category,
    claim: details.claim,
    mechanism: details.mechanism,
    baseline_observation: details.baselineObservation,
    expected_effect: details.expectedEffect,
    verification_method: details.verificationMethod,
    verification_result: details.verificationResult ?? DIRECTIVE_ARTIFACT_UNSET,
    verification_date: details.verificationDate ?? DIRECTIVE_ARTIFACT_UNSET,
    verification_notes: details.verificationNotes ?? DIRECTIVE_ARTIFACT_UNSET,
  });
}

export function buildDirectiveArchitectureAdoptionDecisionArtifact(
  input: DirectiveArchitectureAdoptionDecisionArtifactInput,
): DirectiveArchitectureAdoptionDecisionArtifact {
  const artifactPath = input.artifactPath.trim();
  if (!artifactPath) {
    throw new Error("Architecture adoption artifacts require a non-empty artifactPath.");
  }

  const resolution = input.adoptionResolution ?? resolveArchitectureAdoption(input);
  if (resolution.sourceId !== input.sourceId) {
    throw new Error("Provided adoptionResolution does not match the sourceId.");
  }

  const decision = mergeDirectiveArtifactSections({
    verdict: resolution.verdict,
    rationale: resolution.rationale,
    completion_status: resolution.completionStatus ?? DIRECTIVE_ARTIFACT_UNSET,
    stay_experimental_reason:
      buildStayExperimentalReason(resolution) ?? DIRECTIVE_ARTIFACT_UNSET,
    forge_threshold_check:
      resolution.forgeThresholdCheck ?? DIRECTIVE_ARTIFACT_UNSET,
  });

  return mergeDirectiveArtifactSections({
    decision_format: DIRECTIVE_ARCHITECTURE_ADOPTION_DECISION_FORMAT,
    source_id: input.sourceId,
    adoption_date: resolveAdoptionDate(input.adoptionDate),
    source_analysis_ref:
      (input.sourceAnalysisRef || "").trim() || DIRECTIVE_ARTIFACT_UNSET,
    adaptation_decision_ref:
      (input.adaptationDecisionRef || "").trim() || DIRECTIVE_ARTIFACT_UNSET,
    usefulness_level: input.usefulnessLevel,
    readiness_check: input.readinessCheck,
    artifact_type: resolution.artifactType,
    artifact_path: artifactPath,
    adaptation_quality: input.adaptationQuality,
    improvement_quality:
      input.improvementQuality ?? DIRECTIVE_ARTIFACT_UNSET,
    forge_handoff:
      buildForgeHandoff(input, resolution) ?? DIRECTIVE_ARTIFACT_UNSET,
    self_improvement:
      buildSelfImprovement(input, resolution) ?? DIRECTIVE_ARTIFACT_UNSET,
    decision,
  }) as DirectiveArchitectureAdoptionDecisionArtifact;
}

export function isDirectiveArchitectureAdoptionDecisionArtifact(
  value: unknown,
): value is DirectiveArchitectureAdoptionDecisionArtifact {
  const root = asRecord(value);
  if (!root) return false;

  if (
    root.decision_format !== DIRECTIVE_ARCHITECTURE_ADOPTION_DECISION_FORMAT
    || !nonEmptyString(root.source_id)
    || !nonEmptyString(root.adoption_date)
  ) {
    return false;
  }
  if (!USEFULNESS_LEVELS.has(root.usefulness_level as ArchitectureUsefulnessLevel)) {
    return false;
  }
  if (!ARTIFACT_TYPES.has(root.artifact_type as ArchitectureArtifactType)) {
    return false;
  }
  if (
    !QUALITY_LEVELS.has(
      root.adaptation_quality as ArchitectureAdoptionInput["adaptationQuality"],
    )
  ) {
    return false;
  }
  if (
    root.improvement_quality !== undefined
    && !QUALITY_LEVELS.has(
      root.improvement_quality as ArchitectureAdoptionInput["improvementQuality"],
    )
  ) {
    return false;
  }
  if (!nonEmptyString(root.artifact_path)) {
    return false;
  }

  const readiness = asRecord(root.readiness_check);
  if (!readiness) return false;
  const readinessKeys: Array<keyof ArchitectureAdoptionReadinessCheck> = [
    "source_analysis_complete",
    "adaptation_decision_complete",
    "adaptation_quality_acceptable",
    "delta_evidence_present",
    "no_unresolved_baggage",
  ];
  for (const key of readinessKeys) {
    if (typeof readiness[key] !== "boolean") {
      return false;
    }
  }

  if (root.forge_handoff !== undefined) {
    const forgeHandoff = asRecord(root.forge_handoff);
    if (!forgeHandoff || typeof forgeHandoff.required !== "boolean") {
      return false;
    }
    if (forgeHandoff.ref !== undefined && !nonEmptyString(forgeHandoff.ref)) {
      return false;
    }
    if (
      forgeHandoff.rationale !== undefined
      && !nonEmptyString(forgeHandoff.rationale)
    ) {
      return false;
    }
  }

  if (root.self_improvement !== undefined) {
    const selfImprovement = asRecord(root.self_improvement);
    if (!selfImprovement) return false;
    if (
      !nonEmptyString(selfImprovement.claim)
      || !nonEmptyString(selfImprovement.mechanism)
      || !nonEmptyString(selfImprovement.baseline_observation)
      || !nonEmptyString(selfImprovement.expected_effect)
    ) {
      return false;
    }
    if (
      ![
        "analysis_quality",
        "extraction_quality",
        "adaptation_quality",
        "improvement_quality",
        "routing_quality",
        "evaluation_quality",
        "handoff_quality",
      ].includes(String(selfImprovement.category || ""))
    ) {
      return false;
    }
    if (
      !SELF_IMPROVEMENT_VERIFICATION_METHODS.has(
        selfImprovement.verification_method as ArchitectureSelfImprovementVerificationMethod,
      )
    ) {
      return false;
    }
    if (
      selfImprovement.verification_result !== undefined
      && !SELF_IMPROVEMENT_VERIFICATION_RESULTS.has(
        selfImprovement.verification_result as ArchitectureSelfImprovementVerificationResult,
      )
    ) {
      return false;
    }
    if (
      selfImprovement.verification_date !== undefined
      && !nonEmptyString(selfImprovement.verification_date)
    ) {
      return false;
    }
    if (
      selfImprovement.verification_notes !== undefined
      && !nonEmptyString(selfImprovement.verification_notes)
    ) {
      return false;
    }
  }

  const decision = asRecord(root.decision);
  if (!decision) return false;
  if (
    !DECISION_VERDICTS.has(decision.verdict as ArchitectureAdoptionVerdict)
    || !nonEmptyString(decision.rationale)
  ) {
    return false;
  }
  if (
    decision.completion_status !== undefined
    && !COMPLETION_STATUSES.has(
      decision.completion_status as ArchitectureCompletionStatus,
    )
  ) {
    return false;
  }
  if (
    decision.stay_experimental_reason !== undefined
    && !nonEmptyString(decision.stay_experimental_reason)
  ) {
    return false;
  }
  if (
    decision.forge_threshold_check !== undefined
    && !nonEmptyString(decision.forge_threshold_check)
  ) {
    return false;
  }

  return true;
}
