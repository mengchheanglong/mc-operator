import fs from "node:fs";
import path from "node:path";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

function readIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function includesAll(content: string, required: string[]) {
  const missing = required.filter((term) => !content.includes(term));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const lifecycleContractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "lifecycle-transition-policy.md",
  );
  const scoreContractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "experiment-score-feedback.md",
  );
  const experimentTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "experiment-record.md",
  );
  const policyPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-21-openmoss-lifecycle-policy.md",
  );

  const checks: Check[] = [];
  const lifecycleContract = readIfExists(lifecycleContractPath);
  const scoreContract = readIfExists(scoreContractPath);
  const experimentTemplate = readIfExists(experimentTemplatePath);
  const policy = readIfExists(policyPath);

  checks.push({
    id: "lifecycle-contract-exists",
    ok: Boolean(lifecycleContract),
    reason: lifecycleContract ? null : `missing contract: ${lifecycleContractPath}`,
  });
  checks.push({
    id: "score-contract-exists",
    ok: Boolean(scoreContract),
    reason: scoreContract ? null : `missing contract: ${scoreContractPath}`,
  });
  checks.push({
    id: "experiment-template-exists",
    ok: Boolean(experimentTemplate),
    reason: experimentTemplate ? null : `missing template: ${experimentTemplatePath}`,
  });
  checks.push({
    id: "openmoss-policy-exists",
    ok: Boolean(policy),
    reason: policy ? null : `missing policy note: ${policyPath}`,
  });

  if (lifecycleContract) {
    const required = includesAll(lifecycleContract, [
      "lifecycle_transition_policy/v1",
      "state_transition_matrix",
      "role_gate_matrix",
      "blocked_recovery_lane",
      "promotion_guard",
      "blocked -> analyzed",
      "blocked -> experimenting",
      "detect",
      "reassign",
      "resume",
    ]);
    checks.push({
      id: "lifecycle-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing lifecycle terms: ${required.missing.join(", ")}`,
    });
  }

  if (scoreContract) {
    const required = includesAll(scoreContract, [
      "experiment_score_feedback/v1",
      "review_score_scale",
      "score_delta_mapping",
      "adjustment_role_gate",
      "degraded_quality_behavior",
      "5 -> +2",
      "1 -> -2",
    ]);
    checks.push({
      id: "score-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing score terms: ${required.missing.join(", ")}`,
    });
  }

  if (experimentTemplate) {
    const required = includesAll(experimentTemplate, [
      "Transition policy profile:",
      "Scoring policy profile:",
      "Blocked recovery path:",
    ]);
    checks.push({
      id: "experiment-template-openmoss-fields",
      ok: required.ok,
      reason: required.ok ? null : `missing experiment template fields: ${required.missing.join(", ")}`,
    });
  }

  if (policy) {
    const required = includesAll(policy, [
      "check:directive-openmoss-contracts",
      "check:directive-architecture-contracts",
      "check:ops-stack",
      "blocked-work recovery lane",
    ]);
    checks.push({
      id: "openmoss-policy-validation-hooks",
      ok: required.ok,
      reason: required.ok ? null : `missing policy terms: ${required.missing.join(", ")}`,
    });
  }

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.ok) process.exit(1);
}

main();
