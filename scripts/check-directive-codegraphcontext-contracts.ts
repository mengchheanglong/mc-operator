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
    "index-query-state-boundary.md",
  );
  const policyPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-21-codegraphcontext-state-boundary-policy.md",
  );
  const adoptedPath = path.join(
    directiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-21-codegraphcontext-wave-02-adopted.md",
  );

  const checks: Check[] = [];
  const contract = readIfExists(contractPath);
  const policy = readIfExists(policyPath);
  const adopted = readIfExists(adoptedPath);

  checks.push({
    id: "index-query-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "codegraphcontext-policy-exists",
    ok: Boolean(policy),
    reason: policy ? null : `missing policy note: ${policyPath}`,
  });
  checks.push({
    id: "codegraphcontext-adopted-note-exists",
    ok: Boolean(adopted),
    reason: adopted ? null : `missing adopted note: ${adoptedPath}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      "index_query_state_boundary/v1",
      "index_state",
      "`ready`",
      "`missing-index`",
      "`stale-index`",
      "`partial-index`",
      "index_metadata",
      "query_intent",
      "confidence_note",
      "recommended_refresh_action",
      "unresolved_scope",
      "never present degraded output as complete",
    ]);
    checks.push({
      id: "index-query-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (policy) {
    const required = includesAll(policy, [
      "check:directive-codegraphcontext-contracts",
      "check:directive-architecture-contracts",
      "check:ops-stack",
      "`ready`",
      "`missing-index`",
      "`stale-index`",
      "`partial-index`",
    ]);
    checks.push({
      id: "codegraphcontext-policy-validation-hooks",
      ok: required.ok,
      reason: required.ok ? null : `missing policy terms: ${required.missing.join(", ")}`,
    });
  }

  if (adopted) {
    const required = includesAll(adopted, [
      "product_materialized",
      "index-query-state-boundary.md",
      "check:directive-codegraphcontext-contracts",
    ]);
    checks.push({
      id: "codegraphcontext-adopted-closure-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing adopted-note terms: ${required.missing.join(", ")}`,
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
