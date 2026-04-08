import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  resolveArchitectureAdoption,
  resolveArchitectureArtifactType,
} from "../src/lib/directive-workspace/architecture-adoption-resolution";
import {
  resolveArchitectureReview,
} from "../src/lib/directive-workspace/architecture-review-resolution";

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
    "architecture-adoption-criteria.md",
  );
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "architecture-adoption-decision.schema.json",
  );
  const checks: Check[] = [];
  const contract = readIfExists(contractPath);
  const schema = readIfExists(schemaPath);
  const executableLibPath = path.join(
    directiveRoot,
    "shared",
    "lib",
    "architecture-adoption-resolution.ts",
  );

  checks.push({
    id: "architecture-adoption-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "architecture-adoption-schema-exists",
    ok: Boolean(schema),
    reason: schema ? null : `missing schema: ${schemaPath}`,
  });
  checks.push({
    id: "architecture-adoption-resolution-lib-exists",
    ok: fs.existsSync(executableLibPath),
    reason: fs.existsSync(executableLibPath)
      ? null
      : `missing executable adoption lib: ${executableLibPath}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      "shared-lib",
      "Would this mechanism still be valuable if we never built a runtime surface for it?",
      "stay_experimental",
      "hand off to Forge",
      "Meta-useful mechanisms get adoption priority",
    ]);
    checks.push({
      id: "architecture-adoption-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (schema) {
    const required = includesAll(schema, [
      "\"usefulness_level\"",
      "\"artifact_type\"",
      "\"forge_handoff\"",
      "\"decision\"",
      "\"completion_status\"",
    ]);
    checks.push({
      id: "architecture-adoption-schema-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing schema terms: ${required.missing.join(", ")}`,
    });
  }

  try {
    assert.equal(resolveArchitectureArtifactType("executable_logic"), "shared-lib");
    assert.equal(resolveArchitectureArtifactType("data_shape"), "schema");
    checks.push({
      id: "architecture-adoption-artifact-type-matrix",
      ok: true,
      reason: null,
    });

    const strongReview = resolveArchitectureReview({
      candidateId: "adoption-strong-review",
      checks: {
        state_visibility_check: "pass",
        rollback_check: "pass",
        scope_isolation_check: "pass",
        validation_link_check: "pass",
        ownership_boundary_check: "pass",
        packet_consumption_check: "pass",
        artifact_evidence_continuity_check: "pass",
      },
    });

    const adopted = resolveArchitectureAdoption({
      sourceId: "dw-src-adoption-strong",
      usefulnessLevel: "structural",
      valueShape: "executable_logic",
      readinessCheck: {
        source_analysis_complete: true,
        adaptation_decision_complete: true,
        adaptation_quality_acceptable: true,
        delta_evidence_present: true,
        no_unresolved_baggage: true,
      },
      adaptationQuality: "strong",
      improvementQuality: "adequate",
      productArtifactMaterialized: true,
      proofExecuted: true,
      targetArtifactClarified: true,
      valuableWithoutRuntimeSurface: true,
      reviewResolution: strongReview,
    });
    assert.equal(adopted.verdict, "adopt");
    assert.equal(adopted.artifactType, "shared-lib");
    assert.equal(adopted.completionStatus, "product_materialized");
    checks.push({
      id: "architecture-adoption-strong-case-adopts",
      ok: true,
      reason: null,
    });

    const directHandoff = resolveArchitectureAdoption({
      sourceId: "dw-src-adoption-direct",
      usefulnessLevel: "direct",
      valueShape: "interface_or_handoff",
      readinessCheck: {
        source_analysis_complete: true,
        adaptation_decision_complete: true,
        adaptation_quality_acceptable: true,
        delta_evidence_present: true,
        no_unresolved_baggage: true,
      },
      adaptationQuality: "adequate",
      improvementQuality: "adequate",
      proofExecuted: true,
      targetArtifactClarified: true,
      remainingValueIsRuntimeCapability: true,
      requiresHostIntegration: true,
      architectureValueCaptured: true,
      explicitForgeHandoffReady: true,
      valuableWithoutRuntimeSurface: false,
      reviewResolution: strongReview,
    });
    assert.equal(directHandoff.verdict, "hand_off_to_forge");
    assert.equal(directHandoff.completionStatus, "routed_out_of_architecture");
    assert.equal(directHandoff.forgeHandoff.required, true);
    checks.push({
      id: "architecture-adoption-direct-case-hands-off-to-forge",
      ok: true,
      reason: null,
    });

    const weakReadiness = resolveArchitectureAdoption({
      sourceId: "dw-src-adoption-weak",
      usefulnessLevel: "meta",
      valueShape: "operating_model_change",
      readinessCheck: {
        source_analysis_complete: true,
        adaptation_decision_complete: false,
        adaptation_quality_acceptable: false,
        delta_evidence_present: false,
        no_unresolved_baggage: true,
      },
      adaptationQuality: "weak",
      improvementQuality: "skipped",
      proofExecuted: false,
      targetArtifactClarified: false,
      valuableWithoutRuntimeSurface: true,
      reviewResolution: strongReview,
    });
    assert.equal(weakReadiness.verdict, "stay_experimental");
    assert.equal(weakReadiness.completionStatus, "doc_only_or_planned");
    assert.ok(weakReadiness.requiredGaps.length >= 4);
    checks.push({
      id: "architecture-adoption-readiness-gap-stays-experimental",
      ok: true,
      reason: null,
    });

    const blockedReview = resolveArchitectureReview({
      candidateId: "adoption-blocked-review",
      checks: {
        state_visibility_check: "pass",
        rollback_check: "pass",
        scope_isolation_check: "pass",
        validation_link_check: "fail",
        ownership_boundary_check: "fail",
        packet_consumption_check: "pass",
        artifact_evidence_continuity_check: "pass",
      },
      blockedReason: "validation and ownership are unresolved",
    });
    const blockedAdoption = resolveArchitectureAdoption({
      sourceId: "dw-src-adoption-blocked",
      usefulnessLevel: "structural",
      valueShape: "behavior_rule",
      readinessCheck: {
        source_analysis_complete: true,
        adaptation_decision_complete: true,
        adaptation_quality_acceptable: true,
        delta_evidence_present: true,
        no_unresolved_baggage: true,
      },
      adaptationQuality: "adequate",
      improvementQuality: "adequate",
      proofExecuted: true,
      targetArtifactClarified: true,
      valuableWithoutRuntimeSurface: true,
      reviewResolution: blockedReview,
    });
    assert.equal(blockedAdoption.verdict, "stay_experimental");
    assert.equal(blockedAdoption.reviewPassed, false);
    assert.ok(blockedAdoption.requiredGaps.some((item) => item.includes("validation")));
    checks.push({
      id: "architecture-adoption-review-block-keeps-experimental",
      ok: true,
      reason: null,
    });
  } catch (error) {
    checks.push({
      id: "architecture-adoption-executable-lane-smoke",
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
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
