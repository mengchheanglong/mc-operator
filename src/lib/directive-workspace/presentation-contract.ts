// Canonical Forge presentation contract lives in
// directive-workspace/forge/core/presentation-contract.ts.
// Mission Control keeps a host-local mirror until Next/Turbopack can
// consume the standalone Forge package reliably in production builds.
import { DIRECTIVE_WORKSPACE_V0, type DirectiveRuntimeStatus } from "@/lib/directive-workspace/v0";

export type DirectiveLifecycleCapabilityInput = {
  createdAt: string;
  runtimeStatus: DirectiveRuntimeStatus;
};

export type DirectiveLifecycleDecisionInput = {
  createdAt: string;
  decision: string;
};

export type DirectiveLifecycleIntegrationInput = {
  status: string;
  updatedAt: string;
};

export type DirectiveIntegrationProofArtifactInput = {
  capabilityId: string;
  title: string;
  sourceRef: string;
  timestamp: string;
  method: string;
  reference: string;
  summary: string;
};

export type DirectiveIntegrationProofReportInput =
  DirectiveIntegrationProofArtifactInput & {
    artifactPath: string;
  };

export type DirectiveDecisionReportInput = {
  capabilityId: string;
  title: string;
  sourceType: string;
  sourceRef: string;
  decision: string;
  rationale: string;
  integrationSurface: string | null;
  decisionLeadTimeHours: number | null;
  adoptToCallableLeadTimeHours: number | null;
};

export function reportHrefFromDate(date: string) {
  return `/dashboard/report?day=${encodeURIComponent(date.slice(0, 10))}`;
}

export function proofTimestampSuffix(timestamp: string) {
  return timestamp.replace(/[:.]/g, "-");
}

export function computeDirectiveLeadTimeHours(
  startAt: string,
  endAt: string,
): number | null {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const hours = (end - start) / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100;
}

export function summarizeDirectiveLifecycle(input: {
  capability: DirectiveLifecycleCapabilityInput;
  decisions: DirectiveLifecycleDecisionInput[];
  integrations: DirectiveLifecycleIntegrationInput[];
}) {
  const latestDecision = input.decisions[0] || null;
  const decisionLeadTimeHours = latestDecision
    ? computeDirectiveLeadTimeHours(
        input.capability.createdAt,
        latestDecision.createdAt,
      )
    : null;
  const callableIntegration =
    latestDecision?.decision === "adopt"
      ? input.integrations.find((row) => row.status === "active") || null
      : null;

  return {
    latestDecision,
    decisionLeadTimeHours,
    adoptToCallableLeadTimeHours:
      input.capability.runtimeStatus === "callable" && callableIntegration
        ? computeDirectiveLeadTimeHours(
            input.capability.createdAt,
            callableIntegration.updatedAt,
          )
        : null,
  };
}

export function buildDirectiveIntegrationProofArtifactContent(
  input: DirectiveIntegrationProofArtifactInput,
) {
  return [
    "# Directive Integration Proof",
    "",
    `- capabilityId: ${input.capabilityId}`,
    `- title: ${input.title}`,
    `- sourceRef: ${input.sourceRef}`,
    `- timestamp: ${input.timestamp}`,
    `- method: ${input.method}`,
    `- reference: ${input.reference}`,
    "",
    `Summary: ${input.summary}`,
  ].join("\n");
}

export function buildDirectiveIntegrationProofReportContent(
  input: DirectiveIntegrationProofReportInput,
) {
  return [
    "# Directive Integration Proof",
    "",
    `- capabilityId: ${input.capabilityId}`,
    `- sourceRef: ${input.sourceRef}`,
    `- method: ${input.method}`,
    `- reference: ${input.reference}`,
    `- artifactPath: ${input.artifactPath}`,
    `- timestamp: ${input.timestamp}`,
    "",
    `Summary: ${input.summary}`,
  ].join("\n");
}

export function buildDirectiveDecisionReportContent(
  input: DirectiveDecisionReportInput,
) {
  return [
    "# Directive Workspace Decision",
    "",
    `- capabilityId: ${input.capabilityId}`,
    `- title: ${input.title}`,
    `- sourceType: ${input.sourceType}`,
    `- sourceRef: ${input.sourceRef}`,
    `- decision: ${input.decision}`,
    `- rationale: ${input.rationale}`,
    input.integrationSurface
      ? `- integrationSurface: ${input.integrationSurface}`
      : "- integrationSurface: none",
    "",
    "## workflow",
    DIRECTIVE_WORKSPACE_V0.workflowSentence,
    "",
    "## primary metric",
    `${DIRECTIVE_WORKSPACE_V0.primaryMetricKey} <= ${DIRECTIVE_WORKSPACE_V0.primaryMetricTargetHours}h`,
    `decision_lead_time_hours: ${input.decisionLeadTimeHours ?? "unknown"}`,
    input.adoptToCallableLeadTimeHours !== null
      ? `adopt_to_callable_lead_time_hours: ${input.adoptToCallableLeadTimeHours}`
      : "adopt_to_callable_lead_time_hours: pending",
  ].join("\n");
}
