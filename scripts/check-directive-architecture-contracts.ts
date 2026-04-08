import fs from "node:fs";
import path from "node:path";
import { resolveDirectiveWorkspaceRoot } from "../src/server/paths/directive-workspace-root";

type Check = {
  id: string;
  ok: boolean;
  reason?: string;
};

function readIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function includesAll(content: string, required: string[]) {
  const missing = required.filter((value) => !content.includes(value));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function main() {
  const directiveRoot = resolveDirectiveWorkspaceRoot();

  const contractPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-20-stage-evidence-citation-handoff-contract.md",
  );
  const slicePath = path.join(
    directiveRoot,
    "architecture",
    "02-experiments",
    "2026-03-20-cross-source-contract-delta-slice-01.md",
  );
  const routingPath = path.join(
    directiveRoot,
    "discovery",
    "routing-log",
    "2026-03-20-cross-source-wave-01-routing.md",
  );

  const checks: Check[] = [];

  const contract = readIfExists(contractPath);
  const slice = readIfExists(slicePath);
  const routing = readIfExists(routingPath);

  checks.push({
    id: "contract-file-exists",
    ok: Boolean(contract),
    reason: contract ? undefined : `missing contract file: ${contractPath}`,
  });
  checks.push({
    id: "slice-file-exists",
    ok: Boolean(slice),
    reason: slice ? undefined : `missing slice file: ${slicePath}`,
  });
  checks.push({
    id: "routing-file-exists",
    ok: Boolean(routing),
    reason: routing ? undefined : `missing routing file: ${routingPath}`,
  });

  if (contract) {
    const artifactCheck = includesAll(contract, [
      "IntakeNormalizedArtifact",
      "AnalysisPlanArtifact",
      "ExperimentDesignArtifact",
      "IntegrationContractArtifact",
      "ProofChecklistArtifact",
      "AnalysisEvidenceArtifact",
      "CitationSetArtifact",
      "EvaluationSupportArtifact",
    ]);
    checks.push({
      id: "contract-artifact-vocabulary",
      ok: artifactCheck.ok,
      reason: artifactCheck.ok
        ? undefined
        : `missing artifact terms: ${artifactCheck.missing.join(", ")}`,
    });

    const ruleCheck = includesAll(contract, [
      "fail-closed",
      "degrade to `partial`",
      "runtime/callable promotion without contract + proof artifacts",
      "check:directive-runtime-records",
      "check:ops-stack",
    ]);
    checks.push({
      id: "contract-rule-coverage",
      ok: ruleCheck.ok,
      reason: ruleCheck.ok
        ? undefined
        : `missing rule terms: ${ruleCheck.missing.join(", ")}`,
    });
  }

  if (slice) {
    const rollbackOk = slice.includes("Rollback / No-op");
    checks.push({
      id: "slice-contract-linkage",
      ok: slice.includes("2026-03-20-stage-evidence-citation-handoff-contract.md"),
      reason: slice.includes("2026-03-20-stage-evidence-citation-handoff-contract.md")
        ? undefined
        : "slice does not link required contract output artifact",
    });
    checks.push({
      id: "slice-has-commands-and-gates",
      ok:
        slice.includes("Commands run (ordered)") &&
        slice.includes("Validation Gates") &&
        rollbackOk,
      reason:
        slice.includes("Commands run (ordered)") &&
        slice.includes("Validation Gates") &&
        rollbackOk
          ? undefined
          : "slice missing required commands/gates/rollback sections",
    });
    checks.push({
      id: "slice-minimum-structure",
      ok:
        slice.includes("Required Output Artifact") &&
        slice.includes("Objective") &&
        slice.includes("Scope") &&
        slice.includes("Execution Steps"),
      reason:
        slice.includes("Required Output Artifact") &&
        slice.includes("Objective") &&
        slice.includes("Scope") &&
        slice.includes("Execution Steps")
          ? undefined
          : "slice missing required structural sections",
    });
  }

  if (routing) {
    checks.push({
      id: "routing-links-slice",
      ok: routing.includes("2026-03-20-cross-source-contract-delta-slice-01.md"),
      reason: routing.includes("2026-03-20-cross-source-contract-delta-slice-01.md")
        ? undefined
        : "routing record does not reference executed architecture slice",
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
  if (failed.length > 0) process.exit(1);
}

main();
