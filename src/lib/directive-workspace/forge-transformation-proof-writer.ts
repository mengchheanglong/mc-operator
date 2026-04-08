// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/forge-transformation-proof-writer.ts.
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

function normalizeChecks(
  values?: Array<{
    check_name: string;
    result: "pass" | "fail";
  }> | null,
) {
  return (values ?? []).map((value) => ({
    check_name: requiredString(value.check_name, "regression_checks.check_name"),
    result: value.result,
  }));
}

export type ForgeTransformationType =
  | "speed"
  | "cost"
  | "reliability"
  | "maintainability"
  | "correctness"
  | "runtime-fit"
  | "quality";

export type ForgeTransformationMeasurement = {
  metric: string;
  value: string | number;
  measurement_method: string;
};

export type ForgeTransformationProofRequest = {
  candidate_id: string;
  candidate_name?: string | null;
  proof_date: string;
  transformation_type: ForgeTransformationType;
  preservation_claim: string;
  baseline_measurement: ForgeTransformationMeasurement;
  result_measurement: ForgeTransformationMeasurement;
  comparison_summary: string;
  rollback_verification: string;
  regression_checks?: Array<{
    check_name: string;
    result: "pass" | "fail";
  }> | null;
  output_relative_path?: string | null;
};

export function resolveForgeTransformationProofPath(input: {
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
      `${input.proof_date}-${input.candidate_id}-transformation-proof.json`,
    )
    .replace(/\\/g, "/");
}

export function renderForgeTransformationProof(
  request: ForgeTransformationProofRequest,
) {
  return {
    candidate_id: requiredString(request.candidate_id, "candidate_id"),
    transformation_type: requiredString(
      request.transformation_type,
      "transformation_type",
    ),
    preservation_claim: requiredString(
      request.preservation_claim,
      "preservation_claim",
    ),
    baseline_measurement: {
      metric: requiredString(
        request.baseline_measurement.metric,
        "baseline_measurement.metric",
      ),
      value: request.baseline_measurement.value,
      measurement_method: requiredString(
        request.baseline_measurement.measurement_method,
        "baseline_measurement.measurement_method",
      ),
    },
    result_measurement: {
      metric: requiredString(
        request.result_measurement.metric,
        "result_measurement.metric",
      ),
      value: request.result_measurement.value,
      measurement_method: requiredString(
        request.result_measurement.measurement_method,
        "result_measurement.measurement_method",
      ),
    },
    comparison_summary: requiredString(
      request.comparison_summary,
      "comparison_summary",
    ),
    rollback_verification: requiredString(
      request.rollback_verification,
      "rollback_verification",
    ),
    regression_checks: normalizeChecks(request.regression_checks),
  };
}
