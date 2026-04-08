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
  const laneContractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "automation-lane-split.md",
  );
  const policyPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-21-gh-aw-lane-split-contract-policy.md",
  );
  const promotionContractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "promotion-contract.md",
  );
  const promotionTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "promotion-record.md",
  );

  const checks: Check[] = [];
  const laneContract = readIfExists(laneContractPath);
  const policy = readIfExists(policyPath);
  const promotionContract = readIfExists(promotionContractPath);
  const promotionTemplate = readIfExists(promotionTemplatePath);

  checks.push({
    id: "lane-contract-exists",
    ok: Boolean(laneContract),
    reason: laneContract ? null : `missing contract: ${laneContractPath}`,
  });
  checks.push({
    id: "lane-policy-exists",
    ok: Boolean(policy),
    reason: policy ? null : `missing policy: ${policyPath}`,
  });
  checks.push({
    id: "promotion-contract-exists",
    ok: Boolean(promotionContract),
    reason: promotionContract ? null : `missing contract: ${promotionContractPath}`,
  });
  checks.push({
    id: "promotion-template-exists",
    ok: Boolean(promotionTemplate),
    reason: promotionTemplate ? null : `missing template: ${promotionTemplatePath}`,
  });

  if (laneContract) {
    const laneTerms = includesAll(laneContract, [
      "read_only_lane",
      "write_lane",
      "safe_output_scope",
      "sanitize_policy",
      "compile_contract_artifact",
      "tracker_id",
      "workflow_id",
    ]);
    checks.push({
      id: "lane-contract-required-terms",
      ok: laneTerms.ok,
      reason: laneTerms.ok
        ? null
        : `missing lane contract terms: ${laneTerms.missing.join(", ")}`,
    });
  }

  if (promotionContract) {
    const contractTerms = includesAll(promotionContract, [
      "source_intent_artifact",
      "compile_contract_artifact",
      "runtime_permissions_profile",
      "safe_output_scope",
      "sanitize_policy",
      "source intent is never execution truth by itself",
    ]);
    checks.push({
      id: "promotion-contract-gh-aw-fields",
      ok: contractTerms.ok,
      reason: contractTerms.ok
        ? null
        : `missing promotion contract terms: ${contractTerms.missing.join(", ")}`,
    });
  }

  if (promotionTemplate) {
    const templateTerms = includesAll(promotionTemplate, [
      "Source intent artifact:",
      "Compile contract artifact:",
      "Runtime permissions profile:",
      "Safe output scope:",
      "Sanitize policy:",
    ]);
    checks.push({
      id: "promotion-template-gh-aw-fields",
      ok: templateTerms.ok,
      reason: templateTerms.ok
        ? null
        : `missing promotion template fields: ${templateTerms.missing.join(", ")}`,
    });
  }

  if (policy) {
    const policyTerms = includesAll(policy, [
      "check:directive-gh-aw-contracts",
      "check:directive-architecture-contracts",
      "check:ops-stack",
      "fail-closed",
    ]);
    checks.push({
      id: "lane-policy-validation-hooks",
      ok: policyTerms.ok,
      reason: policyTerms.ok
        ? null
        : `missing policy terms: ${policyTerms.missing.join(", ")}`,
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
