// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-case-record-writer.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
export type DiscoveryCaseIntakeSection = {
  intake_date: string;
  source_type: string;
  source_reference: string;
  submitted_by: string;
  why_it_entered_the_system: string;
  claimed_value: string;
  initial_relevance_to_workspace: string;
  suspected_adoption_target: string;
  source_location_on_disk?: string | null;
  stack_language?: string | null;
  stack_runtime?: string | null;
  stack_framework?: string | null;
  stack_package_tool?: string | null;
  stack_deployment?: string | null;
  stack_external_dependencies?: string | null;
  stack_data_model_assumptions?: string | null;
  stack_integration_shape?: string | null;
  immediate_notes?: string | null;
  output_relative_path?: string | null;
};

export type DiscoveryCaseTriageSection = {
  triage_date: string;
  first_pass_summary: string;
  problem_it_appears_to_solve: string;
  extractable_value_hypothesis: string;
  routing_recommendation: string;
  proposed_adoption_target: string;
  stack_shape_summary: string;
  boilerplate_vs_product_boundary: string;
  suggested_decision_state: string;
  fit_to_current_direction: string;
  reusability_across_surfaces: string;
  operational_risk: string;
  integration_cost: string;
  can_current_gates_validate_safely: string;
  immediate_risks: string;
  missing_evidence: string;
  next_action: string;
  monitor_defer_trigger_conditions?: string | null;
  reentry_conditions?: string | null;
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

export function resolveDiscoveryIntakeRecordPath(input: {
  candidate_id: string;
  intake_date: string;
  output_relative_path?: string | null;
}) {
  const explicit = optionalString(input.output_relative_path);
  if (explicit) {
    return explicit.replace(/\\/g, "/");
  }
  return `discovery/intake/${input.intake_date}-${slugifyCandidateId(
    input.candidate_id,
  )}-intake.md`;
}

export function resolveDiscoveryTriageRecordPath(input: {
  candidate_id: string;
  triage_date: string;
  output_relative_path?: string | null;
}) {
  const explicit = optionalString(input.output_relative_path);
  if (explicit) {
    return explicit.replace(/\\/g, "/");
  }
  return `discovery/triage/${input.triage_date}-${slugifyCandidateId(
    input.candidate_id,
  )}-triage.md`;
}

export function renderDiscoveryIntakeRecord(input: {
  candidate_id: string;
  candidate_name: string;
  intake: DiscoveryCaseIntakeSection;
  linked_triage_record: string;
}) {
  return `# Discovery Intake Record: ${requiredString(input.candidate_name, "candidate_name")}

- Candidate id: ${requiredString(input.candidate_id, "candidate_id")}
- Candidate name: ${requiredString(input.candidate_name, "candidate_name")}
- Intake date: ${requiredString(input.intake.intake_date, "intake.intake_date")}
- Source type: ${requiredString(input.intake.source_type, "intake.source_type")}
- Source reference: ${requiredString(input.intake.source_reference, "intake.source_reference")}
- Source location on disk: ${optionalString(input.intake.source_location_on_disk) ?? "n/a"}
- Submitted by: ${requiredString(input.intake.submitted_by, "intake.submitted_by")}
- Why it entered the system: ${requiredString(input.intake.why_it_entered_the_system, "intake.why_it_entered_the_system")}
- Claimed value: ${requiredString(input.intake.claimed_value, "intake.claimed_value")}
- Initial relevance to the workspace: ${requiredString(input.intake.initial_relevance_to_workspace, "intake.initial_relevance_to_workspace")}
- Suspected adoption target: ${requiredString(input.intake.suspected_adoption_target, "intake.suspected_adoption_target")}
- Stack language: ${optionalString(input.intake.stack_language) ?? "n/a"}
- Stack runtime: ${optionalString(input.intake.stack_runtime) ?? "n/a"}
- Stack framework: ${optionalString(input.intake.stack_framework) ?? "n/a"}
- Stack package tool: ${optionalString(input.intake.stack_package_tool) ?? "n/a"}
- Stack deployment: ${optionalString(input.intake.stack_deployment) ?? "n/a"}
- Stack external dependencies: ${optionalString(input.intake.stack_external_dependencies) ?? "n/a"}
- Stack data model assumptions: ${optionalString(input.intake.stack_data_model_assumptions) ?? "n/a"}
- Stack integration shape: ${optionalString(input.intake.stack_integration_shape) ?? "n/a"}
- Immediate notes: ${optionalString(input.intake.immediate_notes) ?? "n/a"}
- Linked triage record: ${requiredString(input.linked_triage_record, "linked_triage_record")}
`;
}

export function renderDiscoveryTriageRecord(input: {
  candidate_id: string;
  candidate_name: string;
  triage: DiscoveryCaseTriageSection;
  linked_intake_record: string;
}) {
  return `# Discovery Triage Record: ${requiredString(input.candidate_name, "candidate_name")}

- Candidate id: ${requiredString(input.candidate_id, "candidate_id")}
- Candidate name: ${requiredString(input.candidate_name, "candidate_name")}
- Triage date: ${requiredString(input.triage.triage_date, "triage.triage_date")}
- First-pass summary: ${requiredString(input.triage.first_pass_summary, "triage.first_pass_summary")}
- Problem it appears to solve: ${requiredString(input.triage.problem_it_appears_to_solve, "triage.problem_it_appears_to_solve")}
- Extractable value hypothesis: ${requiredString(input.triage.extractable_value_hypothesis, "triage.extractable_value_hypothesis")}
- Routing recommendation: ${requiredString(input.triage.routing_recommendation, "triage.routing_recommendation")}
- Proposed adoption target: ${requiredString(input.triage.proposed_adoption_target, "triage.proposed_adoption_target")}
- Stack-shape summary: ${requiredString(input.triage.stack_shape_summary, "triage.stack_shape_summary")}
- Boilerplate vs product boundary: ${requiredString(input.triage.boilerplate_vs_product_boundary, "triage.boilerplate_vs_product_boundary")}
- Suggested decision state: ${requiredString(input.triage.suggested_decision_state, "triage.suggested_decision_state")}
- Fit to current direction: ${requiredString(input.triage.fit_to_current_direction, "triage.fit_to_current_direction")}
- Reusability across surfaces: ${requiredString(input.triage.reusability_across_surfaces, "triage.reusability_across_surfaces")}
- Operational risk: ${requiredString(input.triage.operational_risk, "triage.operational_risk")}
- Integration cost: ${requiredString(input.triage.integration_cost, "triage.integration_cost")}
- Can current gates validate it safely: ${requiredString(input.triage.can_current_gates_validate_safely, "triage.can_current_gates_validate_safely")}
- Immediate risks: ${requiredString(input.triage.immediate_risks, "triage.immediate_risks")}
- Missing evidence: ${requiredString(input.triage.missing_evidence, "triage.missing_evidence")}
- Monitor/Defer trigger conditions: ${optionalString(input.triage.monitor_defer_trigger_conditions) ?? "n/a"}
- Re-entry conditions: ${optionalString(input.triage.reentry_conditions) ?? "n/a"}
- Next action: ${requiredString(input.triage.next_action, "triage.next_action")}
- Linked intake record: ${requiredString(input.linked_intake_record, "linked_intake_record")}
`;
}
