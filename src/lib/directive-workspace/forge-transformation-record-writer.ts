// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/forge-transformation-record-writer.ts.
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
  return normalized || null;
}

export type ForgeTransformationRecordRequest = {
  candidate_id: string;
  candidate_name: string;
  record_date: string;
  transformation_type: string;
  discovery_intake_path: string;
  component: string;
  current_implementation: string;
  baseline_metric: string;
  baseline_value: string;
  baseline_measurement_method: string;
  proposed_change: string;
  preservation_claim: string;
  expected_improvement_metric: string;
  expected_target_value: string;
  expected_measurement_method: string;
  evaluator_type: string;
  evaluator_command?: string | null;
  comparison_mode: string;
  baseline_artifact_path: string;
  result_artifact_path: string;
  correctness_preserved: string;
  metric_improvement_measured: string;
  rollback_path: string;
  rollback_tested: string;
  decision_state: string;
  promotion_record?: string | null;
  mission_alignment: string;
  capability_gap_id: string;
  output_relative_path?: string | null;
};

export function resolveForgeTransformationRecordPath(input: {
  candidate_id: string;
  record_date: string;
  output_relative_path?: string | null;
}) {
  if (input.output_relative_path && input.output_relative_path.trim().length > 0) {
    return input.output_relative_path.trim();
  }
  return path
    .join(
      "forge",
      "records",
      `${input.record_date}-${input.candidate_id}-transformation-record.md`,
    )
    .replace(/\\/g, "/");
}

export function renderForgeTransformationRecord(
  request: ForgeTransformationRecordRequest,
) {
  const promotionRecord = optionalString(request.promotion_record);

  return `# Transformation Record: ${requiredString(request.candidate_name, "candidate_name")}

- Candidate id: ${requiredString(request.candidate_id, "candidate_id")}
- Candidate name: ${requiredString(request.candidate_name, "candidate_name")}
- Record date: ${requiredString(request.record_date, "record_date")}
- Transformation type: ${requiredString(request.transformation_type, "transformation_type")}
- Discovery intake path: \`${requiredString(request.discovery_intake_path, "discovery_intake_path")}\`

## Before State

- Component: ${requiredString(request.component, "component")}
- Current implementation: ${requiredString(request.current_implementation, "current_implementation")}
- Measured baseline:
  - metric: ${requiredString(request.baseline_metric, "baseline_metric")}
  - value: ${requiredString(request.baseline_value, "baseline_value")}
  - measurement method: ${requiredString(request.baseline_measurement_method, "baseline_measurement_method")}

## After State

- Proposed change: ${requiredString(request.proposed_change, "proposed_change")}
- Preservation claim: ${requiredString(request.preservation_claim, "preservation_claim")}
- Expected improvement:
  - metric: ${requiredString(request.expected_improvement_metric, "expected_improvement_metric")}
  - target value: ${requiredString(request.expected_target_value, "expected_target_value")}
  - measurement method: ${requiredString(request.expected_measurement_method, "expected_measurement_method")}

## Evaluator

- Evaluator type: ${requiredString(request.evaluator_type, "evaluator_type")}
- Evaluator command (if automated): ${optionalString(request.evaluator_command) ?? "n/a"}
- Comparison mode: ${requiredString(request.comparison_mode, "comparison_mode")}
- Baseline artifact path: \`${requiredString(request.baseline_artifact_path, "baseline_artifact_path")}\`
- Result artifact path: \`${requiredString(request.result_artifact_path, "result_artifact_path")}\`

## Proof

- Correctness preserved: ${requiredString(request.correctness_preserved, "correctness_preserved")}
- Metric improvement measured: ${requiredString(request.metric_improvement_measured, "metric_improvement_measured")}
- Rollback path: ${requiredString(request.rollback_path, "rollback_path")}
- Rollback tested: ${requiredString(request.rollback_tested, "rollback_tested")}

## Decision

- Decision state: ${requiredString(request.decision_state, "decision_state")}
- Adoption target: Forge
- Promotion record (if promoted): ${promotionRecord ? `\`${promotionRecord}\`` : "n/a"}
- Mission alignment (which active-mission objective does this serve): ${requiredString(request.mission_alignment, "mission_alignment")}
- Addresses known capability gap (gap_id or n/a): ${requiredString(request.capability_gap_id, "capability_gap_id")}
`;
}
