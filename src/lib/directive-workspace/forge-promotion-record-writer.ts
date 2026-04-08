// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/forge-promotion-record-writer.ts.
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

export type ForgePromotionRecordRequest = {
  candidate_id: string;
  candidate_name: string;
  promotion_date: string;
  linked_forge_record: string;
  target_host: string;
  target_runtime_surface: string;
  integration_mode: string;
  source_intent_artifact: string;
  compile_contract_artifact: string;
  runtime_permissions_profile: string;
  safe_output_scope: string;
  sanitize_policy: string;
  proposed_runtime_status: string;
  proof_path: string;
  quality_gate_profile: string;
  promotion_profile_family: string;
  proof_shape: string;
  primary_host_checker: string;
  full_text_coverage_threshold: string;
  evidence_binding_threshold: string;
  citation_error_threshold: string;
  observed_full_text_coverage: string;
  observed_evidence_binding: string;
  observed_citation_error_rate: string;
  quality_gate_result: string;
  validation_state: string;
  quality_gate_fail_reasons?: string[] | null;
  required_gates?: string[] | null;
  validation_result: string;
  rollback_plan: string;
  owner: string;
  promotion_decision: string;
  output_relative_path?: string | null;
};

export function resolveForgePromotionRecordPath(input: {
  candidate_id: string;
  promotion_date: string;
  output_relative_path?: string | null;
}) {
  if (input.output_relative_path && input.output_relative_path.trim().length > 0) {
    return input.output_relative_path.trim();
  }
  return path
    .join(
      "forge",
      "promotion-records",
      `${input.promotion_date}-${input.candidate_id}-promotion-record.md`,
    )
    .replace(/\\/g, "/");
}

export function renderForgePromotionRecord(
  request: ForgePromotionRecordRequest,
) {
  const candidateId = requiredString(request.candidate_id, "candidate_id");
  const candidateName = requiredString(request.candidate_name, "candidate_name");
  const promotionDate = requiredString(request.promotion_date, "promotion_date");
  const linkedForgeRecord = requiredString(
    request.linked_forge_record,
    "linked_forge_record",
  );
  const targetHost = requiredString(request.target_host, "target_host");
  const targetRuntimeSurface = requiredString(
    request.target_runtime_surface,
    "target_runtime_surface",
  );
  const integrationMode = requiredString(
    request.integration_mode,
    "integration_mode",
  );
  const sourceIntentArtifact = requiredString(
    request.source_intent_artifact,
    "source_intent_artifact",
  );
  const compileContractArtifact = requiredString(
    request.compile_contract_artifact,
    "compile_contract_artifact",
  );
  const runtimePermissionsProfile = requiredString(
    request.runtime_permissions_profile,
    "runtime_permissions_profile",
  );
  const safeOutputScope = requiredString(
    request.safe_output_scope,
    "safe_output_scope",
  );
  const sanitizePolicy = requiredString(
    request.sanitize_policy,
    "sanitize_policy",
  );
  const proposedRuntimeStatus = requiredString(
    request.proposed_runtime_status,
    "proposed_runtime_status",
  );
  const proofPath = requiredString(request.proof_path, "proof_path");
  const qualityGateProfile = requiredString(
    request.quality_gate_profile,
    "quality_gate_profile",
  );
  const promotionProfileFamily = requiredString(
    request.promotion_profile_family,
    "promotion_profile_family",
  );
  const proofShape = requiredString(request.proof_shape, "proof_shape");
  const primaryHostChecker = requiredString(
    request.primary_host_checker,
    "primary_host_checker",
  );
  const fullTextCoverageThreshold = requiredString(
    request.full_text_coverage_threshold,
    "full_text_coverage_threshold",
  );
  const evidenceBindingThreshold = requiredString(
    request.evidence_binding_threshold,
    "evidence_binding_threshold",
  );
  const citationErrorThreshold = requiredString(
    request.citation_error_threshold,
    "citation_error_threshold",
  );
  const observedFullTextCoverage = requiredString(
    request.observed_full_text_coverage,
    "observed_full_text_coverage",
  );
  const observedEvidenceBinding = requiredString(
    request.observed_evidence_binding,
    "observed_evidence_binding",
  );
  const observedCitationErrorRate = requiredString(
    request.observed_citation_error_rate,
    "observed_citation_error_rate",
  );
  const qualityGateResult = requiredString(
    request.quality_gate_result,
    "quality_gate_result",
  );
  const validationState = requiredString(
    request.validation_state,
    "validation_state",
  );
  const validationResult = requiredString(
    request.validation_result,
    "validation_result",
  );
  const rollbackPlan = requiredString(
    request.rollback_plan,
    "rollback_plan",
  );
  const owner = requiredString(request.owner, "owner");
  const promotionDecision = requiredString(
    request.promotion_decision,
    "promotion_decision",
  );

  return `# Promotion Record: ${candidateName}

- Candidate id: ${candidateId}
- Candidate name: ${candidateName}
- Promotion date: ${promotionDate}
- Linked Forge record: \`${linkedForgeRecord}\`
- Target host: ${targetHost}
- Target runtime surface: ${targetRuntimeSurface}
- Integration mode: ${integrationMode}
- Source intent artifact: \`${sourceIntentArtifact}\`
- Compile contract artifact: \`${compileContractArtifact}\`
- Runtime permissions profile: ${runtimePermissionsProfile}
- Safe output scope: ${safeOutputScope}
- Sanitize policy: ${sanitizePolicy}
- Proposed runtime status: ${proposedRuntimeStatus}
- Proof path: \`${proofPath}\`
- Quality gate profile: ${qualityGateProfile}
- Promotion profile family: ${promotionProfileFamily}
- Proof shape: ${proofShape}
- Primary host checker: \`${primaryHostChecker}\`
- Full-text coverage threshold (%): ${fullTextCoverageThreshold}
- Evidence-binding threshold (%): ${evidenceBindingThreshold}
- Citation-error threshold (%): ${citationErrorThreshold}
- Observed full-text coverage (%): ${observedFullTextCoverage}
- Observed evidence-binding (%): ${observedEvidenceBinding}
- Observed citation error rate (%): ${observedCitationErrorRate}
- Quality gate result: ${qualityGateResult}
- Validation state: ${validationState}
- Quality gate fail reasons:
${renderListOrPlaceholder(normalizeList(request.quality_gate_fail_reasons))}
- Required gates:
${renderListOrPlaceholder(normalizeList(request.required_gates).map((value) =>
    value.startsWith("`") ? value : `\`${value}\``
  ))}
- Validation result: ${validationResult}
- Rollback plan: ${rollbackPlan}
- Owner: ${owner}
- Promotion decision: ${promotionDecision}
`;
}
