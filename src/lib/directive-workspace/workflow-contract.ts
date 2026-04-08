// Canonical Forge workflow contract lives in
// directive-workspace/forge/core/workflow-contract.ts.
// Mission Control keeps a host-local mirror until Next/Turbopack can
// consume the standalone Forge package reliably in production builds.
import {
  DIRECTIVE_SOURCE_FLOW,
  DIRECTIVE_USEFULNESS_LEVELS,
  DIRECTIVE_WORKSPACE_V0,
  inferDirectiveCapabilityTitle,
  normalizeDirectiveEvaluationOutcome,
  normalizeDirectiveExperimentStatus,
  normalizeDirectiveNotes,
  normalizeDirectiveRecommendation,
  normalizeDirectiveSourceType,
  type DirectiveCapabilitySourceType,
  type DirectiveCapabilityRecommendation,
  type DirectiveExperimentStatus,
  type DirectiveEvaluationOutcome,
} from "@/lib/directive-workspace/v0";

export type DirectiveCandidateContractInput = {
  sourceType?: unknown;
  sourceRef: unknown;
  title?: unknown;
  userIntent?: unknown;
  notes?: unknown;
  metadata?: Record<string, unknown>;
};

export type DirectiveCandidateContract = {
  sourceType: DirectiveCapabilitySourceType;
  sourceRef: string;
  title: string;
  userIntent: string | null;
  notes: string[];
  metadata: Record<string, unknown>;
};

export type DirectiveAnalysisContractInput = {
  analysisSummary: unknown;
  category?: unknown;
  problemFit?: unknown;
  overlapNotes?: unknown;
  riskNotes?: unknown;
  recommendation: unknown;
  metadata?: Record<string, unknown>;
};

export type DirectiveAnalysisContract = {
  analysisSummary: string;
  category: string | null;
  problemFit: string | null;
  overlapNotes: string | null;
  riskNotes: string | null;
  recommendation: DirectiveCapabilityRecommendation;
  metadata: Record<string, unknown>;
};

export type DirectiveExperimentContractInput = {
  hypothesis: unknown;
  plan: unknown;
  successCriteria?: unknown;
  runId?: unknown;
  artifactPath?: unknown;
  status?: unknown;
  metadata?: Record<string, unknown>;
};

export type DirectiveExperimentContract = {
  hypothesis: string;
  plan: string;
  successCriteria: string[];
  runId: string | null;
  artifactPath: string | null;
  status: DirectiveExperimentStatus;
  metadata: Record<string, unknown>;
};

export type DirectiveEvaluationContractInput = {
  outcome: unknown;
  usefulness?: unknown;
  friction?: unknown;
  workflowImpact?: unknown;
  evidenceSummary: unknown;
  metadata?: Record<string, unknown>;
};

export type DirectiveEvaluationContract = {
  outcome: DirectiveEvaluationOutcome;
  usefulness: string | null;
  friction: string | null;
  workflowImpact: string | null;
  evidenceSummary: string;
  metadata: Record<string, unknown>;
};

export function normalizeDirectiveCandidateContract(
  input: DirectiveCandidateContractInput,
): DirectiveCandidateContract {
  const sourceType = normalizeDirectiveSourceType(
    input.sourceType || "internal-signal",
  );
  const sourceRef = String(input.sourceRef || "").trim();
  if (!sourceRef) {
    throw new Error("invalid_input: sourceRef is required");
  }

  const title =
    String(input.title || "").trim() || inferDirectiveCapabilityTitle(sourceRef);
  if (!title) {
    throw new Error("invalid_input: title is required");
  }

  return {
    sourceType,
    sourceRef,
    title,
    userIntent: String(input.userIntent || "").trim() || null,
    notes: normalizeDirectiveNotes(input.notes),
    metadata: {
      ...(input.metadata || {}),
      workflowSentence: DIRECTIVE_WORKSPACE_V0.workflowSentence,
      sourceFlow: [...DIRECTIVE_SOURCE_FLOW],
      usefulnessLevels: [...DIRECTIVE_USEFULNESS_LEVELS],
      primaryMetric: {
        key: DIRECTIVE_WORKSPACE_V0.primaryMetricKey,
        targetHours: DIRECTIVE_WORKSPACE_V0.primaryMetricTargetHours,
      },
    },
  };
}

export function normalizeDirectiveAnalysisContract(
  input: DirectiveAnalysisContractInput,
): DirectiveAnalysisContract {
  const analysisSummary = String(input.analysisSummary || "").trim();
  if (!analysisSummary) {
    throw new Error("invalid_input: analysisSummary is required");
  }

  return {
    analysisSummary,
    category: String(input.category || "").trim() || null,
    problemFit: String(input.problemFit || "").trim() || null,
    overlapNotes: String(input.overlapNotes || "").trim() || null,
    riskNotes: String(input.riskNotes || "").trim() || null,
    recommendation: normalizeDirectiveRecommendation(input.recommendation),
    metadata: input.metadata || {},
  };
}

export function normalizeDirectiveExperimentContract(
  input: DirectiveExperimentContractInput,
): DirectiveExperimentContract {
  const hypothesis = String(input.hypothesis || "").trim();
  const plan = String(input.plan || "").trim();
  if (!hypothesis) {
    throw new Error("invalid_input: hypothesis is required");
  }
  if (!plan) {
    throw new Error("invalid_input: plan is required");
  }

  return {
    hypothesis,
    plan,
    successCriteria: normalizeDirectiveNotes(input.successCriteria),
    runId: String(input.runId || "").trim() || null,
    artifactPath: String(input.artifactPath || "").trim() || null,
    status: normalizeDirectiveExperimentStatus(input.status || "proposed"),
    metadata: input.metadata || {},
  };
}

export function normalizeDirectiveEvaluationContract(
  input: DirectiveEvaluationContractInput,
): DirectiveEvaluationContract {
  const evidenceSummary = String(input.evidenceSummary || "").trim();
  if (!evidenceSummary) {
    throw new Error("invalid_input: evidenceSummary is required");
  }

  return {
    outcome: normalizeDirectiveEvaluationOutcome(input.outcome),
    usefulness: String(input.usefulness || "").trim() || null,
    friction: String(input.friction || "").trim() || null,
    workflowImpact: String(input.workflowImpact || "").trim() || null,
    evidenceSummary,
    metadata: input.metadata || {},
  };
}
