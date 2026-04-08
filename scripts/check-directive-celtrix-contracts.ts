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
    "intake-stack-signals.md",
  );
  const policyPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-21-celtrix-stack-signal-policy.md",
  );
  const adoptedPath = path.join(
    directiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-21-celtrix-wave-03-adopted.md",
  );
  const intakeTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "intake-record.md",
  );
  const triageTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "triage-record.md",
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
  const intakeTemplate = readIfExists(intakeTemplatePath);
  const triageTemplate = readIfExists(triageTemplatePath);
  const fastPathTemplate = readIfExists(fastPathTemplatePath);

  checks.push({
    id: "stack-signals-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "celtrix-policy-exists",
    ok: Boolean(policy),
    reason: policy ? null : `missing policy note: ${policyPath}`,
  });
  checks.push({
    id: "celtrix-adopted-note-exists",
    ok: Boolean(adopted),
    reason: adopted ? null : `missing adopted note: ${adoptedPath}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      "intake_stack_signals/v1",
      "stack.language",
      "stack.runtime",
      "stack.framework",
      "stack.packageTool",
      "stack.deployment",
      "stack.externalDependencies",
      "stack.dataModelAssumptions",
      "stack.integrationShape",
      "starter kits, scaffolders, and generated templates must not be treated as product dependencies by default",
    ]);
    checks.push({
      id: "stack-signals-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (policy) {
    const required = includesAll(policy, [
      "check:directive-celtrix-contracts",
      "check:directive-workflow-doctrine",
      "check:ops-stack",
      "stack shape early",
      "boilerplate generation from product integration",
    ]);
    checks.push({
      id: "celtrix-policy-validation-hooks",
      ok: required.ok,
      reason: required.ok ? null : `missing policy terms: ${required.missing.join(", ")}`,
    });
  }

  if (adopted) {
    const required = includesAll(adopted, [
      "product_materialized",
      "intake-stack-signals.md",
      "check:directive-celtrix-contracts",
    ]);
    checks.push({
      id: "celtrix-adopted-closure-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing adopted-note terms: ${required.missing.join(", ")}`,
    });
  }

  for (const [id, template, requiredTerms] of [
    [
      "intake-template-stack-fields",
      intakeTemplate,
      [
        "Stack language:",
        "Stack runtime:",
        "Stack framework:",
        "Stack package tool:",
        "Stack deployment:",
        "Stack external dependencies:",
        "Stack data model assumptions:",
        "Stack integration shape:",
      ],
    ],
    [
      "triage-template-stack-boundary-fields",
      triageTemplate,
      ["Stack-shape summary:", "Boilerplate vs product boundary:"],
    ],
    [
      "fast-path-template-stack-fields",
      fastPathTemplate,
      [
        "Stack language:",
        "Stack runtime:",
        "Stack framework:",
        "Stack package tool:",
        "Stack deployment:",
        "Stack external dependencies:",
        "Stack data model assumptions:",
        "Stack integration shape:",
      ],
    ],
  ] as const) {
    if (!template) {
      checks.push({ id, ok: false, reason: "missing template file" });
      continue;
    }
    const required = includesAll(template, requiredTerms);
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
