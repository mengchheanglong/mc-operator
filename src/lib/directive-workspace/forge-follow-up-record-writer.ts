// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/forge-follow-up-record-writer.ts.
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

function optionalString(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
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

export type ForgeFollowUpRecordRequest = {
  candidate_id: string;
  candidate_name: string;
  follow_up_date: string;
  current_decision_state: string;
  origin_track: string;
  runtime_value_to_operationalize: string;
  proposed_host: string;
  proposed_integration_mode: string;
  source_pack_allowlist_profile?: string | null;
  allowed_export_surfaces?: string[] | null;
  excluded_baggage?: string[] | null;
  promotion_contract_path?: string | null;
  reentry_contract_path?: string | null;
  reentry_preconditions?: string[] | null;
  required_proof?: string[] | null;
  required_gates?: string[] | null;
  trial_scope_limit?: string[] | null;
  risks?: string[] | null;
  rollback: string;
  no_op_path: string;
  review_cadence: string;
  current_status: string;
  linked_handoff_path?: string | null;
  linked_forge_record_path?: string | null;
  linked_proof_checklist_path?: string | null;
  linked_live_proof_path?: string | null;
  output_relative_path?: string | null;
};

export function resolveForgeFollowUpRecordPath(input: {
  candidate_id: string;
  follow_up_date: string;
  output_relative_path?: string | null;
}) {
  if (input.output_relative_path && input.output_relative_path.trim().length > 0) {
    return input.output_relative_path.trim();
  }
  return path
    .join(
      "forge",
      "follow-up",
      `${input.follow_up_date}-${input.candidate_id}-forge-follow-up-record.md`,
    )
    .replace(/\\/g, "/");
}

export function renderForgeFollowUpRecord(
  request: ForgeFollowUpRecordRequest,
) {
  const candidateId = requiredString(request.candidate_id, "candidate_id");
  const candidateName = requiredString(request.candidate_name, "candidate_name");
  const followUpDate = requiredString(request.follow_up_date, "follow_up_date");
  const currentDecisionState = requiredString(
    request.current_decision_state,
    "current_decision_state",
  );
  const originTrack = requiredString(request.origin_track, "origin_track");
  const runtimeValueToOperationalize = requiredString(
    request.runtime_value_to_operationalize,
    "runtime_value_to_operationalize",
  );
  const proposedHost = requiredString(request.proposed_host, "proposed_host");
  const proposedIntegrationMode = requiredString(
    request.proposed_integration_mode,
    "proposed_integration_mode",
  );
  const rollback = requiredString(request.rollback, "rollback");
  const noOpPath = requiredString(request.no_op_path, "no_op_path");
  const reviewCadence = requiredString(request.review_cadence, "review_cadence");
  const currentStatus = requiredString(request.current_status, "current_status");

  const sourcePackAllowlistProfile =
    optionalString(request.source_pack_allowlist_profile) ?? "n/a";
  const promotionContractPath =
    optionalString(request.promotion_contract_path) ?? "pending";
  const reentryContractPath =
    optionalString(request.reentry_contract_path) ?? "n/a";
  const linkedHandoffPath = optionalString(request.linked_handoff_path);
  const linkedForgeRecordPath = optionalString(request.linked_forge_record_path);
  const linkedProofChecklistPath = optionalString(
    request.linked_proof_checklist_path,
  );
  const linkedLiveProofPath = optionalString(request.linked_live_proof_path);

  return `# ${candidateName} Forge Follow-up Record

- Candidate id: \`${candidateId}\`
- Candidate name: \`${candidateName}\`
- Follow-up date: \`${followUpDate}\`
- Current decision state: \`${currentDecisionState}\`
- Origin track: \`${originTrack}\`
- Runtime value to operationalize: ${runtimeValueToOperationalize}
- Proposed host: \`${proposedHost}\`
- Proposed integration mode: ${proposedIntegrationMode}
- Source-pack allowlist profile: ${sourcePackAllowlistProfile}
- Allowed export surfaces:
${renderListOrPlaceholder(normalizeList(request.allowed_export_surfaces))}
- Excluded baggage:
${renderListOrPlaceholder(normalizeList(request.excluded_baggage))}
- Promotion contract path: ${promotionContractPath}
- Re-entry contract path (if deferred): ${reentryContractPath}
- Re-entry preconditions (checklist):
${renderListOrPlaceholder(normalizeList(request.reentry_preconditions))}
- Required proof:
${renderListOrPlaceholder(normalizeList(request.required_proof))}
- Required gates:
${renderListOrPlaceholder(normalizeList(request.required_gates).map((value) =>
    value.startsWith("`") ? value : `\`${value}\``
  ))}
- Trial scope limit (if experimenting):
${renderListOrPlaceholder(normalizeList(request.trial_scope_limit))}
- Risks:
${renderListOrPlaceholder(normalizeList(request.risks))}
- Rollback: ${rollback}
- No-op path: ${noOpPath}
- Review cadence: ${reviewCadence}
- Current status: \`${currentStatus}\`
${linkedHandoffPath ? `\nLinked handoff:\n- \`${linkedHandoffPath}\`` : ""}
${linkedForgeRecordPath ? `\n\nLinked Forge record:\n- \`${linkedForgeRecordPath}\`` : ""}
${linkedProofChecklistPath ? `\n\nLinked proof checklist:\n- \`${linkedProofChecklistPath}\`` : ""}
${linkedLiveProofPath ? `\n\nLinked live proof:\n- \`${linkedLiveProofPath}\`` : ""}
`;
}
