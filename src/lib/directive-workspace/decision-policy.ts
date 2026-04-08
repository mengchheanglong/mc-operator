// Canonical Forge decision policy lives in
// directive-workspace/forge/core/decision-policy.ts.
// Mission Control keeps a host-local mirror until Next/Turbopack can
// consume the standalone Forge package reliably in production builds.
import {
  normalizeDirectiveIntegrationStatus,
  normalizeDirectiveNotes,
  parseDirectiveIntegrationProof,
  type DirectiveCapabilityStatus,
  type DirectiveIntegrationProof,
  type DirectiveIntegrationStatus,
  type DirectiveRuntimeStatus,
} from "@/lib/directive-workspace/v0";

export function resolveStatusAfterDecision(
  decision: string,
  runtimeStatus: DirectiveRuntimeStatus,
): DirectiveCapabilityStatus {
  if (decision !== "adopt") return "decided";
  return runtimeStatus === "callable" ? "integrated" : "decided";
}

export function runtimeStatusFromIntegrationStatus(
  status: DirectiveIntegrationStatus,
): DirectiveRuntimeStatus {
  const normalizedStatus = normalizeDirectiveIntegrationStatus(status);
  if (normalizedStatus === "planned") return "planned";
  if (normalizedStatus === "active") return "callable";
  if (normalizedStatus === "parked") return "parked";
  return "removed";
}

export function normalizeDirectiveAdoptDueAt(value: unknown) {
  const dueAt = String(value || "").trim();
  if (!dueAt) {
    throw new Error("invalid_input: dueAt is required when decision=adopt");
  }
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("invalid_input: dueAt must be a valid ISO timestamp");
  }
  return parsed.toISOString();
}

export function normalizeDirectiveRequiredGates(value: unknown) {
  const gates = normalizeDirectiveNotes(value);
  if (gates.length === 0) {
    throw new Error(
      "invalid_input: requiredGates is required when decision=adopt and must contain at least one check",
    );
  }
  return gates;
}

export function requireDirectiveIntegrationProof(input: unknown): DirectiveIntegrationProof {
  const parsed = parseDirectiveIntegrationProof(input);
  if (!parsed) {
    throw new Error(
      "invalid_input: integrationProof is required when decision=adopt and must include execution ok + artifact reference",
    );
  }
  return parsed;
}

export function normalizeDirectiveRollbackPlan(value: unknown) {
  const rollbackPlan = String(value || "").trim();
  if (!rollbackPlan) {
    throw new Error("invalid_input: rollbackPlan is required when decision=adopt");
  }
  return rollbackPlan;
}
