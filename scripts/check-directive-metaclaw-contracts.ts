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
  const contractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "escalation-boundary-policy.md",
  );
  const templatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "integration-contract-artifact.md",
  );
  const policyPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-21-metaclaw-escalation-policy.md",
  );

  const checks: Check[] = [];
  const contract = readIfExists(contractPath);
  const template = readIfExists(templatePath);
  const policy = readIfExists(policyPath);

  checks.push({
    id: "escalation-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "integration-template-exists",
    ok: Boolean(template),
    reason: template ? null : `missing template: ${templatePath}`,
  });
  checks.push({
    id: "metaclaw-policy-exists",
    ok: Boolean(policy),
    reason: policy ? null : `missing policy note: ${policyPath}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      "escalation_boundary_policy/v1",
      "escalation_mode",
      "background_evaluation_window",
      "boundary_checks",
      "boundary_check_result",
      "`baseline`",
      "`elevated`",
      "`auth`",
      "`health`",
      "`protocol`",
    ]);
    checks.push({
      id: "escalation-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing escalation contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (template) {
    const required = includesAll(template, [
      "- escalation_mode:",
      "- background_evaluation_window:",
      "- boundary_checks:",
      "  - auth:",
      "  - health:",
      "  - protocol:",
      "- boundary_check_result:",
    ]);
    checks.push({
      id: "integration-template-metaclaw-fields",
      ok: required.ok,
      reason: required.ok ? null : `missing integration template fields: ${required.missing.join(", ")}`,
    });
  }

  if (policy) {
    const required = includesAll(policy, [
      "check:directive-metaclaw-contracts",
      "check:directive-architecture-contracts",
      "check:ops-stack",
      "baseline",
      "elevated",
      "auth",
      "health",
      "protocol",
    ]);
    checks.push({
      id: "metaclaw-policy-validation-hooks",
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
