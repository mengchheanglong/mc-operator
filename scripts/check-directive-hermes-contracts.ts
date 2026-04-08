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
    "context-compaction-fidelity.md",
  );
  const policyPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-21-hermes-compaction-fidelity-policy.md",
  );
  const adoptedPath = path.join(
    directiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-21-hermes-wave-02-adopted.md",
  );
  const decisionTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "decision-record.md",
  );
  const routingTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "routing-record.md",
  );
  const fastPathTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "discovery-fast-path-record.md",
  );

  const checks: Check[] = [];
  const contract = readIfExists(contractPath);
  const policy = readIfExists(policyPath);
  const adopted = readIfExists(adoptedPath);
  const decisionTemplate = readIfExists(decisionTemplatePath);
  const routingTemplate = readIfExists(routingTemplatePath);
  const fastPathTemplate = readIfExists(fastPathTemplatePath);

  checks.push({
    id: "compaction-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "hermes-policy-exists",
    ok: Boolean(policy),
    reason: policy ? null : `missing policy note: ${policyPath}`,
  });
  checks.push({
    id: "hermes-adopted-note-exists",
    ok: Boolean(adopted),
    reason: adopted ? null : `missing adopted note: ${adoptedPath}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      "context_compaction_fidelity/v1",
      "`full`",
      "`compacted`",
      "`bypass`",
      "candidateId",
      "decisionState",
      "adoptionTarget",
      "nextAction",
      "riskNotes",
      "rollbackOrNoOp",
      "compaction_reason",
    ]);
    checks.push({
      id: "compaction-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (policy) {
    const required = includesAll(policy, [
      "check:directive-hermes-contracts",
      "check:directive-workflow-doctrine",
      "check:ops-stack",
      "candidateId",
      "decisionState",
      "adoptionTarget",
      "nextAction",
      "riskNotes",
      "rollbackOrNoOp",
    ]);
    checks.push({
      id: "hermes-policy-validation-hooks",
      ok: required.ok,
      reason: required.ok ? null : `missing policy terms: ${required.missing.join(", ")}`,
    });
  }

  if (adopted) {
    const required = includesAll(adopted, [
      "product_materialized",
      "context-compaction-fidelity.md",
      "check:directive-hermes-contracts",
    ]);
    checks.push({
      id: "hermes-adopted-closure-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing adopted-note terms: ${required.missing.join(", ")}`,
    });
  }

  for (const [id, template] of [
    ["decision-template-compaction-fields", decisionTemplate],
    ["routing-template-compaction-fields", routingTemplate],
    ["fast-path-template-compaction-fields", fastPathTemplate],
  ] as const) {
    if (!template) {
      checks.push({
        id,
        ok: false,
        reason: "missing template file",
      });
      continue;
    }

    const required = includesAll(template, [
      "Compaction profile",
      "Compaction status",
      "Compaction reason",
    ]);
    checks.push({
      id,
      ok: required.ok,
      reason: required.ok ? null : `missing template terms: ${required.missing.join(", ")}`,
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
