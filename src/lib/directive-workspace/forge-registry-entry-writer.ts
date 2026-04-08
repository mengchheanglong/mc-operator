// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/forge-registry-entry-writer.ts.
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

function renderParagraphList(values: string[], placeholder = "n/a") {
  if (values.length === 0) {
    return `- ${placeholder}`;
  }
  return values.map((value) => `- ${value}`).join("\n");
}

function normalizeList(values?: string[] | null) {
  return (values ?? [])
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export type ForgeRegistryEntryRequest = {
  candidate_id: string;
  candidate_name: string;
  registry_date: string;
  linked_promotion_record: string;
  host: string;
  runtime_surface: string;
  runtime_status: string;
  proof_path: string;
  last_validated_by: string;
  last_validation_date: string;
  active_risks?: string[] | null;
  rollback_path: string;
  notes?: string[] | null;
  output_relative_path?: string | null;
};

export function resolveForgeRegistryEntryPath(input: {
  candidate_id: string;
  registry_date: string;
  output_relative_path?: string | null;
}) {
  if (input.output_relative_path && input.output_relative_path.trim().length > 0) {
    return input.output_relative_path.trim();
  }
  return path
    .join(
      "forge",
      "registry",
      `${input.registry_date}-${input.candidate_id}-registry-entry.md`,
    )
    .replace(/\\/g, "/");
}

export function renderForgeRegistryEntry(
  request: ForgeRegistryEntryRequest,
) {
  const candidateId = requiredString(request.candidate_id, "candidate_id");
  const candidateName = requiredString(request.candidate_name, "candidate_name");
  const registryDate = requiredString(request.registry_date, "registry_date");
  const linkedPromotionRecord = requiredString(
    request.linked_promotion_record,
    "linked_promotion_record",
  );
  const host = requiredString(request.host, "host");
  const runtimeSurface = requiredString(
    request.runtime_surface,
    "runtime_surface",
  );
  const runtimeStatus = requiredString(
    request.runtime_status,
    "runtime_status",
  );
  const proofPath = requiredString(request.proof_path, "proof_path");
  const lastValidatedBy = requiredString(
    request.last_validated_by,
    "last_validated_by",
  );
  const lastValidationDate = requiredString(
    request.last_validation_date,
    "last_validation_date",
  );
  const rollbackPath = requiredString(
    request.rollback_path,
    "rollback_path",
  );

  return `# Registry Entry: ${candidateName}

- Candidate id: ${candidateId}
- Candidate name: ${candidateName}
- Registry date: ${registryDate}
- Linked promotion record: \`${linkedPromotionRecord}\`
- Host: ${host}
- Runtime surface: ${runtimeSurface}
- Runtime status: ${runtimeStatus}
- Proof path: \`${proofPath}\`
- Last validated by: ${lastValidatedBy}
- Last validation date: ${lastValidationDate}
- Active risks:
${renderParagraphList(normalizeList(request.active_risks))}
- Rollback path: ${rollbackPath}
- Notes:
${renderParagraphList(normalizeList(request.notes))}
`;
}
