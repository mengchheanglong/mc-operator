import {
  DIRECTIVE_WORKSPACE_V0,
  normalizeDirectiveCapabilityStatus,
} from "@/lib/directive-workspace/v0";
import { summarizeDirectiveLifecycle } from "@/lib/directive-workspace/presentation-contract";
import {
  findDirectiveCapabilityById,
  listDirectiveDecisionsForCapability,
  listDirectiveEvaluationsForCapability,
  listDirectiveExperimentsForCapability,
  listDirectiveIntegrationsForCapability,
  listDirectiveRegistry,
} from "@/server/repositories/directive-workspace-repo";

function requireCapability(
  userId: string,
  projectId: string,
  capabilityId: string,
) {
  const capability = findDirectiveCapabilityById(userId, projectId, capabilityId);
  if (!capability) {
    throw new Error(`invalid_input: capability not found for id=${capabilityId}`);
  }
  return capability;
}

export function getDirectiveCapabilityLifecycle(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
}) {
  const capability = requireCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
  );
  const decisions = listDirectiveDecisionsForCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
  );
  const integrations = listDirectiveIntegrationsForCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
  );
  const lifecycle = summarizeDirectiveLifecycle({
    capability,
    decisions,
    integrations,
  });

  return {
    v0: DIRECTIVE_WORKSPACE_V0,
    capability,
    experiments: listDirectiveExperimentsForCapability(
      input.userId,
      input.projectId,
      input.capabilityId,
    ),
    evaluations: listDirectiveEvaluationsForCapability(
      input.userId,
      input.projectId,
      input.capabilityId,
    ),
    decisions,
    integrations,
    latestDecision: lifecycle.latestDecision,
    decisionLeadTimeHours: lifecycle.decisionLeadTimeHours,
    adoptToCallableLeadTimeHours: lifecycle.adoptToCallableLeadTimeHours,
  };
}

export function listDirectiveWorkspaceRegistry(input: {
  userId: string;
  projectId: string;
  status?: unknown;
}) {
  const requestedStatus = String(input.status || "").trim();
  const rows = listDirectiveRegistry(input.userId, input.projectId);
  if (!requestedStatus) {
    return rows;
  }

  const normalizedStatus = normalizeDirectiveCapabilityStatus(requestedStatus);
  return rows.filter((row) => row.capability.status === normalizedStatus);
}
