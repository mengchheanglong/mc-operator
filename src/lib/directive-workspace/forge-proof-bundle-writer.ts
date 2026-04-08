// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/forge-proof-bundle-writer.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import path from "node:path";

function requiredString(value: string, fieldName: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeList(values?: string[] | null) {
  return (values ?? [])
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function renderListOrPlaceholder(values: string[], placeholder = "n/a") {
  if (values.length === 0) {
    return `  - ${placeholder}`;
  }
  return values.map((value) => `  - ${value}`).join("\n");
}

export type ForgeProofBundleRequest = {
  candidate_id: string;
  candidate_name: string;
  proof_date: string;
  linked_forge_record: string;
  required_proof_items?: string[] | null;
  validation_commands?: string[] | null;
  source_proof_artifacts?: string[] | null;
  gate_snapshot: Record<string, unknown>;
  pass_fail_summary: string;
  rollback_verification: string;
  status: string;
  output_relative_path?: string | null;
  gate_snapshot_relative_path?: string | null;
};

export function resolveForgeProofChecklistPath(input: {
  candidate_id: string;
  proof_date: string;
  output_relative_path?: string | null;
}) {
  if (input.output_relative_path && input.output_relative_path.trim().length > 0) {
    return input.output_relative_path.trim();
  }
  return path
    .join(
      "forge",
      "records",
      `${input.proof_date}-${input.candidate_id}-proof-checklist.md`,
    )
    .replace(/\\/g, "/");
}

export function resolveForgeProofGateSnapshotPath(input: {
  candidate_id: string;
  proof_date: string;
  gate_snapshot_relative_path?: string | null;
}) {
  if (
    input.gate_snapshot_relative_path
    && input.gate_snapshot_relative_path.trim().length > 0
  ) {
    return input.gate_snapshot_relative_path.trim();
  }
  return path
    .join(
      "forge",
      "records",
      `${input.proof_date}-${input.candidate_id}-gate-snapshot.json`,
    )
    .replace(/\\/g, "/");
}

export function renderForgeProofChecklist(input: {
  request: ForgeProofBundleRequest;
  gateSnapshotPath: string;
}) {
  const candidateId = requiredString(input.request.candidate_id, "candidate_id");
  const candidateName = requiredString(input.request.candidate_name, "candidate_name");
  const proofDate = requiredString(input.request.proof_date, "proof_date");
  const linkedForgeRecord = requiredString(
    input.request.linked_forge_record,
    "linked_forge_record",
  );
  const passFailSummary = requiredString(
    input.request.pass_fail_summary,
    "pass_fail_summary",
  );
  const rollbackVerification = requiredString(
    input.request.rollback_verification,
    "rollback_verification",
  );
  const status = requiredString(input.request.status, "status");

  return `# Proof Checklist Artifact: ${candidateName}

- Artifact type: \`ProofChecklistArtifact\`
- Candidate id: ${candidateId}
- Candidate name: ${candidateName}
- Capability id: ${candidateId}
- Capability name: ${candidateName}
- Generated at: ${proofDate}
- Linked Forge record: \`${linkedForgeRecord}\`
- Required proof items:
${renderListOrPlaceholder(normalizeList(input.request.required_proof_items))}
- Validation commands:
${renderListOrPlaceholder(normalizeList(input.request.validation_commands).map((value) =>
    value.startsWith("`") ? value : `\`${value}\``
  ))}
- Source proof artifacts:
${renderListOrPlaceholder(normalizeList(input.request.source_proof_artifacts).map((value) =>
    value.startsWith("`") ? value : `\`${value}\``
  ))}
- Gate snapshot: \`${input.gateSnapshotPath}\`
- Pass/fail summary: ${passFailSummary}
- Rollback verification: ${rollbackVerification}
- Status: ${status}
`;
}
