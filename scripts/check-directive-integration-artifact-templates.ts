import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  generateIntegrationArtifacts,
  writeGeneratedIntegrationArtifacts,
} from "../src/lib/directive-workspace/integration-artifact-generator";

type Check = {
  id: string;
  ok: boolean;
  reason?: string;
};

function includesAll(content: string, required: string[]) {
  const missing = required.filter((value) => !content.includes(value));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function readIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const workspaceRoot = process.cwd();
  const directiveRoot = path.resolve(workspaceRoot, "..", "directive-workspace");

  const integrationTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "integration-contract-artifact.md",
  );
  const proofTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "proof-checklist-artifact.md",
  );
  const generatorScriptPath = path.join(
    workspaceRoot,
    "scripts",
    "generate-directive-integration-artifacts.ts",
  );
  const sampleExperimentPath = path.join(
    directiveRoot,
    "architecture",
    "02-experiments",
    "2026-03-20-cross-source-contract-delta-slice-09.md",
  );

  const checks: Check[] = [];
  const integrationTemplate = readIfExists(integrationTemplatePath);
  const proofTemplate = readIfExists(proofTemplatePath);
  const sampleExperiment = readIfExists(sampleExperimentPath);

  checks.push({
    id: "integration-template-exists",
    ok: Boolean(integrationTemplate),
    reason: integrationTemplate ? undefined : `missing template: ${integrationTemplatePath}`,
  });
  checks.push({
    id: "proof-template-exists",
    ok: Boolean(proofTemplate),
    reason: proofTemplate ? undefined : `missing template: ${proofTemplatePath}`,
  });
  checks.push({
    id: "generator-script-exists",
    ok: fs.existsSync(generatorScriptPath),
    reason: fs.existsSync(generatorScriptPath)
      ? undefined
      : `missing generator script: ${generatorScriptPath}`,
  });
  checks.push({
    id: "sample-experiment-exists",
    ok: Boolean(sampleExperiment),
    reason: sampleExperiment ? undefined : `missing sample experiment: ${sampleExperimentPath}`,
  });

  if (integrationTemplate) {
    const result = includesAll(integrationTemplate, [
      "Artifact type: `IntegrationContractArtifact`",
      "capability_id:",
      "source_experiment_design_artifact:",
      "adoption_target:",
      "integration_mode:",
      "required_gates:",
      "rollback_plan:",
    ]);
    checks.push({
      id: "integration-template-fields",
      ok: result.ok,
      reason: result.ok ? undefined : `missing fields: ${result.missing.join(", ")}`,
    });
  }

  if (proofTemplate) {
    const result = includesAll(proofTemplate, [
      "Artifact type: `ProofChecklistArtifact`",
      "capability_id:",
      "source_experiment_design_artifact:",
      "required_proof_items:",
      "validation_commands:",
      "gate_snapshot:",
      "pass_fail_summary:",
      "rollback_verification:",
    ]);
    checks.push({
      id: "proof-template-fields",
      ok: result.ok,
      reason: result.ok ? undefined : `missing fields: ${result.missing.join(", ")}`,
    });
  }

  if (sampleExperiment) {
    const generated = generateIntegrationArtifacts({
      experimentArtifactPath: sampleExperimentPath,
      experimentArtifactContent: sampleExperiment,
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-int-artifacts-"));
    const date = "2026-03-20";
    const written = writeGeneratedIntegrationArtifacts({
      outputDir: tmpDir,
      date,
      candidateId: generated.extraction.candidateId,
      integrationContractArtifact: generated.integrationContractArtifact,
      proofChecklistArtifact: generated.proofChecklistArtifact,
    });

    const integrationGenerated = readIfExists(written.integrationPath);
    const proofGenerated = readIfExists(written.proofPath);

    checks.push({
      id: "generator-writes-integration-artifact",
      ok: Boolean(integrationGenerated && integrationGenerated.includes("IntegrationContractArtifact")),
      reason:
        integrationGenerated && integrationGenerated.includes("IntegrationContractArtifact")
          ? undefined
          : "generated integration artifact missing or malformed",
    });
    checks.push({
      id: "generator-writes-proof-artifact",
      ok: Boolean(proofGenerated && proofGenerated.includes("ProofChecklistArtifact")),
      reason:
        proofGenerated && proofGenerated.includes("ProofChecklistArtifact")
          ? undefined
          : "generated proof artifact missing or malformed",
    });
    checks.push({
      id: "generator-extracts-validation-gates",
      ok:
        generated.extraction.validationGates.includes("npm run check:directive-v0") &&
        generated.extraction.validationGates.includes("npm run check:ops-stack"),
      reason: "extraction did not include expected validation gates from sample artifact",
    });

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
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
