import type {
  ArchitectureArtifactType,
  ArchitectureCompletionStatus,
  ArchitectureSelfImprovementCategory,
  ArchitectureUsefulnessLevel,
} from "./architecture-adoption-resolution";
import type {
  DirectiveArchitectureAdoptionDecisionArtifact,
} from "./architecture-adoption-artifacts";

export type ArchitectureDecisionVerdict =
  DirectiveArchitectureAdoptionDecisionArtifact["decision"]["verdict"];

export type DirectiveArchitectureCycleDecisionSummary = {
  totalArtifactsReviewed: number;
  verdictCounts: Record<ArchitectureDecisionVerdict, number>;
  usefulnessCounts: Record<ArchitectureUsefulnessLevel, number>;
  artifactTypeCounts: Record<ArchitectureArtifactType, number>;
  completionStatusCounts: Record<ArchitectureCompletionStatus, number>;
  forgeHandoffRequiredCount: number;
  stayExperimentalCount: number;
  metaSelfImprovementCategoryCounts: Record<
    ArchitectureSelfImprovementCategory,
    number
  >;
};

const DECISION_VERDICTS: ArchitectureDecisionVerdict[] = [
  "adopt",
  "stay_experimental",
  "hand_off_to_forge",
  "defer",
  "reject",
];

const USEFULNESS_LEVELS: ArchitectureUsefulnessLevel[] = [
  "direct",
  "structural",
  "meta",
];

const ARTIFACT_TYPES: ArchitectureArtifactType[] = [
  "contract",
  "schema",
  "template",
  "policy",
  "reference-pattern",
  "shared-lib",
  "doctrine-update",
];

const COMPLETION_STATUSES: ArchitectureCompletionStatus[] = [
  "product_materialized",
  "product_partial",
  "doc_only_or_planned",
  "routed_out_of_architecture",
  "reference_only",
];

const SELF_IMPROVEMENT_CATEGORIES: ArchitectureSelfImprovementCategory[] = [
  "analysis_quality",
  "extraction_quality",
  "adaptation_quality",
  "improvement_quality",
  "routing_quality",
  "evaluation_quality",
  "handoff_quality",
];

function zeroedRecord<T extends string>(keys: T[]) {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function summarizeDirectiveArchitectureCycleDecisions(input: {
  adoptionArtifacts: DirectiveArchitectureAdoptionDecisionArtifact[];
}): DirectiveArchitectureCycleDecisionSummary {
  const verdictCounts = zeroedRecord(DECISION_VERDICTS);
  const usefulnessCounts = zeroedRecord(USEFULNESS_LEVELS);
  const artifactTypeCounts = zeroedRecord(ARTIFACT_TYPES);
  const completionStatusCounts = zeroedRecord(COMPLETION_STATUSES);
  const metaSelfImprovementCategoryCounts = zeroedRecord(
    SELF_IMPROVEMENT_CATEGORIES,
  );

  let forgeHandoffRequiredCount = 0;
  let stayExperimentalCount = 0;

  for (const artifact of input.adoptionArtifacts) {
    verdictCounts[artifact.decision.verdict] += 1;
    usefulnessCounts[artifact.usefulness_level] += 1;
    artifactTypeCounts[artifact.artifact_type] += 1;

    const completionStatus = artifact.decision.completion_status;
    if (completionStatus) {
      completionStatusCounts[completionStatus] += 1;
    }

    if (artifact.forge_handoff?.required) {
      forgeHandoffRequiredCount += 1;
    }
    if (artifact.decision.verdict === "stay_experimental") {
      stayExperimentalCount += 1;
    }

    const selfImprovementCategory = artifact.self_improvement?.category;
    if (selfImprovementCategory) {
      metaSelfImprovementCategoryCounts[selfImprovementCategory] += 1;
    }
  }

  return {
    totalArtifactsReviewed: input.adoptionArtifacts.length,
    verdictCounts,
    usefulnessCounts,
    artifactTypeCounts,
    completionStatusCounts,
    forgeHandoffRequiredCount,
    stayExperimentalCount,
    metaSelfImprovementCategoryCounts,
  };
}
