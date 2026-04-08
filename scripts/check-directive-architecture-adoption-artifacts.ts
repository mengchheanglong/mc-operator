import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildDirectiveArchitectureAdoptionDecisionArtifact,
  isDirectiveArchitectureAdoptionDecisionArtifact,
} from "../src/lib/directive-workspace/architecture-adoption-artifacts";
import {
  resolveArchitectureAdoption,
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
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "architecture-adoption-decision.schema.json",
  );
  const executableLibPath = path.join(
    directiveRoot,
    "shared",
    "lib",
    "architecture-adoption-artifacts.ts",
  );
  const checks: Check[] = [];
  const schema = readIfExists(schemaPath);

  checks.push({
    id: "architecture-adoption-decision-schema-exists",
    ok: Boolean(schema),
    reason: schema ? null : `missing schema: ${schemaPath}`,
  });
  checks.push({
    id: "architecture-adoption-artifacts-lib-exists",
    ok: fs.existsSync(executableLibPath),
    reason: fs.existsSync(executableLibPath)
      ? null
      : `missing executable artifact lib: ${executableLibPath}`,
  });

  if (schema) {
    const required = includesAll(schema, [
      "\"source_id\"",
      "\"readiness_check\"",
      "\"self_improvement\"",
      "\"decision\"",
      "\"stay_experimental_reason\"",
    ]);
    checks.push({
      id: "architecture-adoption-artifacts-schema-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing schema terms: ${required.missing.join(", ")}`,
    });
  }

  try {
    const strongReview = resolveArchitectureReview({
      candidateId: "artifact-strong-review",
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

    const adoptedArtifact = buildDirectiveArchitectureAdoptionDecisionArtifact({
      sourceId: "dw-src-artifact-strong",
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
      artifactPath: "shared/lib/example-architecture-helper.ts",
      adoptionDate: "2026-03-23",
      sourceAnalysisRef: "architecture/02-experiments/example-source-analysis.md",
      adaptationDecisionRef: "architecture/02-experiments/example-adaptation.md",
    });
    assert.equal(isDirectiveArchitectureAdoptionDecisionArtifact(adoptedArtifact), true);
    assert.equal(adoptedArtifact.decision.verdict, "adopt");
    assert.equal(adoptedArtifact.artifact_type, "shared-lib");
    assert.equal(
      adoptedArtifact.decision.completion_status,
      "product_materialized",
    );
    checks.push({
      id: "architecture-adoption-artifacts-strong-adopt-case",
      ok: true,
      reason: null,
    });

    const forgeArtifact = buildDirectiveArchitectureAdoptionDecisionArtifact({
      sourceId: "dw-src-artifact-forge",
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
      artifactPath: "architecture/03-adopted/example-forge-handoff.md",
      forgeHandoffRef: "forge/handoff/example.md",
    });
    assert.equal(forgeArtifact.decision.verdict, "hand_off_to_forge");
    assert.equal(
      forgeArtifact.decision.completion_status,
      "routed_out_of_architecture",
    );
    assert.equal(forgeArtifact.forge_handoff?.required, true);
    assert.equal(forgeArtifact.forge_handoff?.ref, "forge/handoff/example.md");
    checks.push({
      id: "architecture-adoption-artifacts-forge-handoff-case",
      ok: true,
      reason: null,
    });

    const weakReadinessResolution = resolveArchitectureAdoption({
      sourceId: "dw-src-artifact-weak",
      usefulnessLevel: "structural",
      valueShape: "working_document",
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
    const experimentalArtifact = buildDirectiveArchitectureAdoptionDecisionArtifact({
      sourceId: "dw-src-artifact-weak",
      usefulnessLevel: "structural",
      valueShape: "working_document",
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
      adoptionResolution: weakReadinessResolution,
      artifactPath: "architecture/02-experiments/example-stay-experimental.md",
    });
    assert.equal(experimentalArtifact.decision.verdict, "stay_experimental");
    assert.ok(experimentalArtifact.decision.stay_experimental_reason);
    checks.push({
      id: "architecture-adoption-artifacts-stay-experimental-case",
      ok: true,
      reason: null,
    });

    const metaArtifact = buildDirectiveArchitectureAdoptionDecisionArtifact({
      sourceId: "dw-src-artifact-meta",
      usefulnessLevel: "meta",
      valueShape: "operating_model_change",
      readinessCheck: {
        source_analysis_complete: true,
        adaptation_decision_complete: true,
        adaptation_quality_acceptable: true,
        delta_evidence_present: true,
        no_unresolved_baggage: true,
      },
      adaptationQuality: "strong",
      improvementQuality: "strong",
      productArtifactMaterialized: true,
      proofExecuted: true,
      targetArtifactClarified: true,
      valuableWithoutRuntimeSurface: true,
      metaSelfImprovementCategory: "evaluation_quality",
      reviewResolution: strongReview,
      artifactPath: "knowledge/example-meta-doctrine.md",
      selfImprovement: {
        category: "evaluation_quality",
        claim: "Executable adoption artifacts make review-to-decision output easier to compare across waves.",
        mechanism: "Emit one schema-shaped adoption artifact instead of only prose summaries.",
        baselineObservation:
          "Earlier Decide-step outcomes were split across prose records and checker-specific expectations.",
        expectedEffect:
          "Later cycle evaluation can compare adoption outcomes without reinterpreting prose.",
        verificationMethod: "next_cycle_comparison",
        verificationResult: "not_yet_verified",
      },
    });
    assert.equal(metaArtifact.decision.verdict, "adopt");
    assert.equal(metaArtifact.self_improvement?.category, "evaluation_quality");
    checks.push({
      id: "architecture-adoption-artifacts-meta-self-improvement-case",
      ok: true,
      reason: null,
    });
  } catch (error) {
    checks.push({
      id: "architecture-adoption-artifacts-executable-lane-smoke",
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
