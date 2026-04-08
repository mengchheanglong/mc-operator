import fs from "node:fs";
import path from "node:path";
import { resolveDirectiveWorkspaceRoot } from "../src/server/paths/directive-workspace-root";

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
  const directiveRoot = resolveDirectiveWorkspaceRoot();
  const contractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "source-pack-curation-allowlist.md",
  );
  const policyPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-21-agent-lab-orchestration-allowlist-policy.md",
  );
  const adoptedPath = path.join(
    directiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-21-agent-lab-orchestration-allowlist-wave-04-adopted.md",
  );
  const followupTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "runtime-follow-up-record.md",
  );
  const sourcePacksReadmePath = path.join(
    directiveRoot,
    "runtime",
    "source-packs",
    "README.md",
  );

  const checks: Check[] = [];
  const contract = readIfExists(contractPath);
  const policy = readIfExists(policyPath);
  const adopted = readIfExists(adoptedPath);
  const followupTemplate = readIfExists(followupTemplatePath);
  const sourcePacksReadme = readIfExists(sourcePacksReadmePath);

  checks.push({
    id: "allowlist-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "allowlist-policy-exists",
    ok: Boolean(policy),
    reason: policy ? null : `missing policy note: ${policyPath}`,
  });
  checks.push({
    id: "allowlist-adopted-note-exists",
    ok: Boolean(adopted),
    reason: adopted ? null : `missing adopted note: ${adoptedPath}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      "source_surface",
      "retained_value",
      "adoption_target",
      "allowed_export_surfaces",
      "excluded_baggage",
      "ownership_path",
      "activation_rule",
      "rollback_path",
      "Runtime source pack with explicit readiness marker",
      "vendored dependencies",
      "raw upstream repository layout as runtime truth",
      "SOURCE_PACK_READY.md",
    ]);
    checks.push({
      id: "allowlist-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (policy) {
    const required = includesAll(policy, [
      "check:directive-orchestration-allowlist-contracts",
      "check:directive-architecture-contracts",
      "check:ops-stack",
      "ownership-path declaration",
      "readiness-marker rule",
    ]);
    checks.push({
      id: "allowlist-policy-validation-hooks",
      ok: required.ok,
      reason: required.ok ? null : `missing policy terms: ${required.missing.join(", ")}`,
    });
  }

  if (adopted) {
    const required = includesAll(adopted, [
      "product_materialized",
      "source-pack-curation-allowlist.md",
      "runtime-follow-up-record.md",
      "check:directive-orchestration-allowlist-contracts",
    ]);
    checks.push({
      id: "allowlist-adopted-closure-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing adopted-note terms: ${required.missing.join(", ")}`,
    });
  }

  if (followupTemplate) {
    const required = includesAll(followupTemplate, [
      "Source-pack allowlist profile:",
      "Allowed export surfaces:",
      "Excluded baggage:",
    ]);
    checks.push({
      id: "followup-template-allowlist-fields",
      ok: required.ok,
      reason: required.ok ? null : `missing follow-up template fields: ${required.missing.join(", ")}`,
    });
  } else {
    checks.push({
      id: "followup-template-allowlist-fields",
      ok: false,
      reason: `missing template: ${followupTemplatePath}`,
    });
  }

  if (sourcePacksReadme) {
    const required = includesAll(sourcePacksReadme, [
      "source-pack-curation-allowlist.md",
      "keep it reference-only or drop it",
    ]);
    checks.push({
      id: "source-packs-readme-allowlist-linkage",
      ok: required.ok,
      reason: required.ok ? null : `missing source-packs README terms: ${required.missing.join(", ")}`,
    });
  } else {
    checks.push({
      id: "source-packs-readme-allowlist-linkage",
      ok: false,
      reason: `missing README: ${sourcePacksReadmePath}`,
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
