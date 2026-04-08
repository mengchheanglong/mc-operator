// Canonical Forge proof contract lives in
// directive-workspace/forge/core/proof-contract.ts.
// Mission Control keeps a host-local mirror until Next/Turbopack can
// consume the standalone Forge package reliably in production builds.
import { type DirectiveIntegrationProof } from "@/lib/directive-workspace/v0";
import { proofTimestampSuffix } from "@/lib/directive-workspace/presentation-contract";

export type DirectiveProofRequestInput = {
  capabilityId: string;
  method?: unknown;
  reference?: unknown;
  summary?: unknown;
  timestamp?: string;
};

export type DirectiveProofRequest = {
  timestamp: string;
  method: string;
  reference: string;
  summary: string;
};

export function normalizeDirectiveProofRequest(
  input: DirectiveProofRequestInput,
): DirectiveProofRequest {
  const timestamp = input.timestamp || new Date().toISOString();
  const method = String(input.method || "").trim() || "dashboard-proof";
  const reference =
    String(input.reference || "").trim() ||
    `directive-workspace:${input.capabilityId}:proof:${proofTimestampSuffix(timestamp)}`;
  const summary =
    String(input.summary || "").trim() ||
    "Proof artifact generated from directive workspace workflow.";

  return {
    timestamp,
    method,
    reference,
    summary,
  };
}

export function buildDirectiveIntegrationProof(input: {
  reportId: string;
  reportHref: string;
  artifactPath: string;
  request: DirectiveProofRequest;
}): DirectiveIntegrationProof {
  return {
    execution: {
      ok: true,
      method: input.request.method,
      reference: input.request.reference,
      timestamp: input.request.timestamp,
    },
    artifact: {
      reportId: input.reportId,
      reportHref: input.reportHref,
      artifactPath: input.artifactPath,
      summary: input.request.summary,
    },
  };
}
