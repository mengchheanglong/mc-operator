// Canonical Forge decision contract lives in
// directive-workspace/forge/core/decision-contract.ts.
// Mission Control keeps a host-local mirror until Next/Turbopack can
// consume the standalone Forge package reliably in production builds.
import {
  normalizeDirectiveDecision,
  normalizeDirectiveIntegrationMode,
  normalizeDirectiveIntegrationStatus,
  type DirectiveDecision,
  type DirectiveIntegrationMode,
  type DirectiveIntegrationProof,
  type DirectiveIntegrationStatus,
} from "@/lib/directive-workspace/v0";
import {
  normalizeDirectiveAdoptDueAt,
  normalizeDirectiveRequiredGates,
  normalizeDirectiveRollbackPlan,
  requireDirectiveIntegrationProof,
} from "@/lib/directive-workspace/decision-policy";

export type DirectiveDecisionContractInput = {
  decision: unknown;
  integrationSurface?: unknown;
  targetRuntimeSurface?: unknown;
  integrationMode?: unknown;
  owner?: unknown;
  dueAt?: unknown;
  requiredGates?: unknown;
  integrationStatus?: unknown;
  rollbackPlan?: unknown;
  rollbackNotes?: unknown;
  integrationProof?: unknown;
};

export type DirectiveAdoptContract = {
  integrationSurface: string;
  targetRuntimeSurface: string;
  integrationMode: DirectiveIntegrationMode;
  owner: string;
  dueAt: string;
  requiredGates: string[];
  integrationStatus: DirectiveIntegrationStatus;
  rollbackPlan: string;
  integrationProof: DirectiveIntegrationProof;
};

export type DirectiveDecisionContract = {
  decision: DirectiveDecision;
  adopt: DirectiveAdoptContract | null;
};

export function normalizeDirectiveDecisionContract(
  input: DirectiveDecisionContractInput,
): DirectiveDecisionContract {
  const decision = normalizeDirectiveDecision(input.decision);
  if (decision !== "adopt") {
    return { decision, adopt: null };
  }

  const integrationSurface = String(input.integrationSurface || "").trim();
  if (!integrationSurface) {
    throw new Error(
      "invalid_input: integrationSurface is required when decision=adopt",
    );
  }

  const targetRuntimeSurface = String(
    input.targetRuntimeSurface || integrationSurface,
  ).trim();
  if (!targetRuntimeSurface) {
    throw new Error(
      "invalid_input: targetRuntimeSurface is required when decision=adopt",
    );
  }

  const owner = String(input.owner || "").trim();
  if (!owner) {
    throw new Error("invalid_input: owner is required when decision=adopt");
  }

  return {
    decision,
    adopt: {
      integrationSurface,
      targetRuntimeSurface,
      integrationMode: normalizeDirectiveIntegrationMode(
        input.integrationMode || "adapt",
      ),
      owner,
      dueAt: normalizeDirectiveAdoptDueAt(input.dueAt),
      requiredGates: normalizeDirectiveRequiredGates(input.requiredGates),
      integrationStatus: normalizeDirectiveIntegrationStatus(
        input.integrationStatus || "active",
      ),
      rollbackPlan: normalizeDirectiveRollbackPlan(
        input.rollbackPlan || input.rollbackNotes,
      ),
      integrationProof: requireDirectiveIntegrationProof(input.integrationProof),
    },
  };
}
