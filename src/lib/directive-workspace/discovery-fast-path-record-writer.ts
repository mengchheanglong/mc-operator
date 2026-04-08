// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-fast-path-record-writer.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import type {
  DiscoveryRoutingTarget,
  DiscoverySourceType,
} from "./discovery-intake-queue-writer";
import type { DiscoveryRoutingDecisionState } from "./discovery-routing-record-writer";

export type DiscoveryFastPathRecordRequest = {
  candidate_id: string;
  candidate_name: string;
  record_date: string;
  source_type: DiscoverySourceType;
  source_reference: string;
  claimed_value: string;
  first_pass_summary: string;
  adoption_target: string;
  decision_state: DiscoveryRoutingDecisionState;
  route_destination: Exclude<DiscoveryRoutingTarget, null>;
  why_this_route: string;
  why_not_alternatives: string;
  need_bounded_proof: string;
  next_artifact: string;
  source_location_on_disk?: string | null;
  stack_language?: string | null;
  stack_runtime?: string | null;
  stack_framework?: string | null;
  stack_package_tool?: string | null;
  stack_deployment?: string | null;
  stack_external_dependencies?: string | null;
  stack_data_model_assumptions?: string | null;
  stack_integration_shape?: string | null;
  compaction_profile?: string | null;
  compaction_status?: "full" | "compacted" | "bypass" | null;
  compaction_reason?: string | null;
  reentry_trigger?: string | null;
  review_cadence?: string | null;
  mission_alignment?: string | null;
  capability_gap_id?: string | null;
  gap_worklist_rank?: string | null;
  output_relative_path?: string | null;
};

function requiredString(value: string | null | undefined, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugifyCandidateId(candidateId: string) {
  return candidateId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function resolveDiscoveryFastPathRecordPath(input: {
  candidate_id: string;
  record_date: string;
  output_relative_path?: string | null;
}) {
  const explicit = optionalString(input.output_relative_path);
  if (explicit) {
    return explicit.replace(/\\/g, "/");
  }
  return `discovery/intake/${input.record_date}-${slugifyCandidateId(
    input.candidate_id,
  )}-fast-path.md`;
}

export function renderDiscoveryFastPathRecord(
  request: DiscoveryFastPathRecordRequest,
) {
  const compactionStatus = optionalString(request.compaction_status);
  if (compactionStatus === "bypass" && !optionalString(request.compaction_reason)) {
    throw new Error("compaction_reason is required when compaction_status is bypass");
  }

  return `# Discovery Fast-Path Record: ${requiredString(request.candidate_name, "candidate_name")}

- Candidate id: ${requiredString(request.candidate_id, "candidate_id")}
- Candidate name: ${requiredString(request.candidate_name, "candidate_name")}
- Record date: ${requiredString(request.record_date, "record_date")}
- Source type: ${requiredString(request.source_type, "source_type")}
- Source reference: ${requiredString(request.source_reference, "source_reference")}
- Source location on disk: ${optionalString(request.source_location_on_disk) ?? "n/a"}
- Claimed value: ${requiredString(request.claimed_value, "claimed_value")}
- First-pass summary: ${requiredString(request.first_pass_summary, "first_pass_summary")}
- Stack language: ${optionalString(request.stack_language) ?? "n/a"}
- Stack runtime: ${optionalString(request.stack_runtime) ?? "n/a"}
- Stack framework: ${optionalString(request.stack_framework) ?? "n/a"}
- Stack package tool: ${optionalString(request.stack_package_tool) ?? "n/a"}
- Stack deployment: ${optionalString(request.stack_deployment) ?? "n/a"}
- Stack external dependencies: ${optionalString(request.stack_external_dependencies) ?? "n/a"}
- Stack data model assumptions: ${optionalString(request.stack_data_model_assumptions) ?? "n/a"}
- Stack integration shape: ${optionalString(request.stack_integration_shape) ?? "n/a"}
- Adoption target: ${requiredString(request.adoption_target, "adoption_target")}
- Decision state: ${requiredString(request.decision_state, "decision_state")}
- Route destination: ${requiredString(request.route_destination, "route_destination")}
- Why this route: ${requiredString(request.why_this_route, "why_this_route")}
- Why not the alternatives: ${requiredString(request.why_not_alternatives, "why_not_alternatives")}
- Need bounded proof: ${requiredString(request.need_bounded_proof, "need_bounded_proof")}
- Next artifact: ${requiredString(request.next_artifact, "next_artifact")}
- Compaction profile (if compacted): ${optionalString(request.compaction_profile) ?? "n/a"}
- Compaction status (\`full | compacted | bypass\`): ${compactionStatus ?? "n/a"}
- Compaction reason (required if bypass): ${optionalString(request.compaction_reason) ?? "n/a"}
- Re-entry trigger (if held): ${optionalString(request.reentry_trigger) ?? "n/a"}
- Review cadence (if held): ${optionalString(request.review_cadence) ?? "n/a"}
- Mission alignment (which active-mission objective does this serve): ${optionalString(request.mission_alignment) ?? "n/a"}
- Addresses known capability gap (gap_id or n/a): ${optionalString(request.capability_gap_id) ?? "n/a"}
- Gap worklist rank (if selected from \`discovery/gap-worklist.json\`): ${optionalString(request.gap_worklist_rank) ?? "n/a"}
`;
}
