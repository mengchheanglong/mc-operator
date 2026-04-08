// Canonical Forge capability patch contract lives in
// directive-workspace/forge/core/capability-patch-contract.ts.
// Mission Control keeps a host-local mirror until Next/Turbopack can
// consume the standalone Forge package reliably in production builds.
import {
  resolveStatusAfterDecision,
} from "@/lib/directive-workspace/decision-policy";
import type {
  DirectiveCapabilityStatus,
  DirectiveDecision,
  DirectiveFrameworkStatus,
  DirectiveIntegrationProof,
  DirectiveRuntimeStatus,
} from "@/lib/directive-workspace/v0";
import type {
  DirectiveAnalysisContract,
} from "@/lib/directive-workspace/workflow-contract";

export type DirectiveCapabilityPatch = {
  status?: DirectiveCapabilityStatus;
  frameworkStatus?: DirectiveFrameworkStatus;
  runtimeStatus?: DirectiveRuntimeStatus;
  analysisSummary?: string;
  category?: string | null;
  problemFit?: string | null;
  overlapNotes?: string | null;
  riskNotes?: string | null;
  recommendation?: DirectiveAnalysisContract["recommendation"];
  metadata?: Record<string, unknown>;
};

export function buildDirectiveAnalysisCapabilityPatch(
  analysis: DirectiveAnalysisContract,
): DirectiveCapabilityPatch {
  return {
    status: "analyzed",
    frameworkStatus: "analyzed",
    analysisSummary: analysis.analysisSummary,
    category: analysis.category,
    problemFit: analysis.problemFit,
    overlapNotes: analysis.overlapNotes,
    riskNotes: analysis.riskNotes,
    recommendation: analysis.recommendation,
    metadata: analysis.metadata,
  };
}

export function buildDirectiveExperimentCapabilityPatch(): DirectiveCapabilityPatch {
  return {
    status: "experimenting",
    frameworkStatus: "experimenting",
  };
}

export function buildDirectiveEvaluationCapabilityPatch(): DirectiveCapabilityPatch {
  return {
    status: "evaluated",
    frameworkStatus: "evaluated",
  };
}

export function buildDirectiveDecisionCapabilityPatch(input: {
  decision: DirectiveDecision;
  runtimeStatus: DirectiveRuntimeStatus;
}): DirectiveCapabilityPatch {
  return {
    status: resolveStatusAfterDecision(
      input.decision,
      input.runtimeStatus,
    ),
    frameworkStatus: "decided",
    runtimeStatus: input.runtimeStatus,
  };
}

export function buildDirectiveProofMetadata(input: {
  capabilityMetadata: Record<string, unknown>;
  integrationProof: DirectiveIntegrationProof;
  timestamp: string;
}): Record<string, unknown> {
  return {
    ...input.capabilityMetadata,
    latestIntegrationProof: input.integrationProof,
    latestIntegrationProofAt: input.timestamp,
  };
}
