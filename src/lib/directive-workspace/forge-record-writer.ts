// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/forge-record-writer.ts.
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

export type ForgeRecordRequest = {
  candidate_id: string;
  candidate_name: string;
  forge_record_date: string;
  origin_path: string;
  linked_follow_up_record: string;
  runtime_objective: string;
  proposed_host: string;
  proposed_runtime_surface: string;
  execution_slice: string;
  required_proof: string;
  required_gates?: string[] | null;
  risks?: string[] | null;
  rollback: string;
  current_status: string;
  next_decision_point: string;
  supporting_contracts?: string[] | null;
  output_relative_path?: string | null;
};

export function resolveForgeRecordPath(input: {
  candidate_id: string;
  forge_record_date: string;
  output_relative_path?: string | null;
}) {
  if (input.output_relative_path && input.output_relative_path.trim().length > 0) {
    return input.output_relative_path.trim();
  }
  return path
    .join(
      "forge",
      "records",
      `${input.forge_record_date}-${input.candidate_id}-forge-record.md`,
    )
    .replace(/\\/g, "/");
}

export function renderForgeRecord(request: ForgeRecordRequest) {
  const candidateId = requiredString(request.candidate_id, "candidate_id");
  const candidateName = requiredString(request.candidate_name, "candidate_name");
  const forgeRecordDate = requiredString(
    request.forge_record_date,
    "forge_record_date",
  );
  const originPath = requiredString(request.origin_path, "origin_path");
  const linkedFollowUpRecord = requiredString(
    request.linked_follow_up_record,
    "linked_follow_up_record",
  );
  const runtimeObjective = requiredString(
    request.runtime_objective,
    "runtime_objective",
  );
  const proposedHost = requiredString(request.proposed_host, "proposed_host");
  const proposedRuntimeSurface = requiredString(
    request.proposed_runtime_surface,
    "proposed_runtime_surface",
  );
  const executionSlice = requiredString(
    request.execution_slice,
    "execution_slice",
  );
  const requiredProof = requiredString(request.required_proof, "required_proof");
  const rollback = requiredString(request.rollback, "rollback");
  const currentStatus = requiredString(request.current_status, "current_status");
  const nextDecisionPoint = requiredString(
    request.next_decision_point,
    "next_decision_point",
  );

  return `# Forge Record: ${candidateName}

- Candidate id: ${candidateId}
- Candidate name: ${candidateName}
- Forge record date: ${forgeRecordDate}
- Origin path: \`${originPath}\`
- Linked follow-up record: \`${linkedFollowUpRecord}\`
- Runtime objective: ${runtimeObjective}
- Proposed host: ${proposedHost}
- Proposed runtime surface: ${proposedRuntimeSurface}
- Execution slice: ${executionSlice}
- Required proof: \`${requiredProof}\`
- Required gates:
${renderListOrPlaceholder(normalizeList(request.required_gates).map((value) =>
    value.startsWith("`") ? value : `\`${value}\``
  ))}
- Risks:
${renderListOrPlaceholder(normalizeList(request.risks))}
- Rollback: ${rollback}
- Current status: ${currentStatus}
- Next decision point: ${nextDecisionPoint}
${
    normalizeList(request.supporting_contracts).length > 0
      ? `\nSupporting product contracts:\n${normalizeList(request.supporting_contracts)
          .map((value) => `- \`${value}\``)
          .join("\n")}`
      : ""
  }
`;
}
