import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildDirectiveArchitectureAdoptionDecisionArtifact,
} from "../src/lib/directive-workspace/architecture-adoption-artifacts";
import {
  summarizeDirectiveArchitectureCycleDecisions,
} from "../src/lib/directive-workspace/architecture-cycle-decision-summary";
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
  const cycleTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "architecture-cycle-evaluation.md",
  );
  const executableLibPath = path.join(
    directiveRoot,
    "shared",
    "lib",
    "architecture-cycle-decision-summary.ts",
  );
  const checks: Check[] = [];
  const template = readIfExists(cycleTemplatePath);

  checks.push({
    id: "architecture-cycle-template-exists",
    ok: Boolean(template),
    reason: template ? null : `missing cycle evaluation template: ${cycleTemplatePath}`,
  });
  checks.push({
    id: "architecture-cycle-decision-summary-lib-exists",
    ok: fs.existsSync(executableLibPath),
    reason: fs.existsSync(executableLibPath)
      ? null
      : `missing cycle decision summary lib: ${executableLibPath}`,
  });

  if (template) {
    const required = includesAll(template, [
      "Adoption decision artifacts reviewed:",
      "Adoption verdict counts:",
      "Artifact type distribution:",
      "Completion-status distribution:",
      "Forge handoff required decisions:",
    ]);
    checks.push({
      id: "architecture-cycle-template-decision-metric-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing template terms: ${required.missing.join(", ")}`,
    });
  }

  try {
    const strongReview = resolveArchitectureReview({
      candidateId: "cycle-decision-summary-strong",
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

    const adoptionArtifacts = [
      buildDirectiveArchitectureAdoptionDecisionArtifact({
        sourceId: "dw-cycle-structural",
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
        artifactPath: "shared/lib/example-cycle-structural.ts",
      }),
      buildDirectiveArchitectureAdoptionDecisionArtifact({
        sourceId: "dw-cycle-direct",
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
        artifactPath: "architecture/03-adopted/example-cycle-direct.md",
        forgeHandoffRef: "forge/handoff/example-cycle-direct.md",
      }),
      buildDirectiveArchitectureAdoptionDecisionArtifact({
        sourceId: "dw-cycle-meta",
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
        artifactPath: "knowledge/example-cycle-meta.md",
        selfImprovement: {
          category: "evaluation_quality",
          claim: "Machine-readable decision artifacts make cycle evaluation more comparable across waves.",
          mechanism: "Cycle evaluation can aggregate actual decision outputs instead of prose-only adopted records.",
          baselineObservation: "Cycle summaries previously re-derived decision counts from manual record reading.",
          expectedEffect: "Later waves can compare verdict and handoff composition with less interpretation drift.",
          verificationMethod: "next_cycle_comparison",
        },
      }),
      buildDirectiveArchitectureAdoptionDecisionArtifact({
        sourceId: "dw-cycle-experimental",
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
        artifactPath: "architecture/02-experiments/example-cycle-experimental.md",
      }),
    ];

    const summary = summarizeDirectiveArchitectureCycleDecisions({
      adoptionArtifacts,
    });

    assert.equal(summary.totalArtifactsReviewed, 4);
    assert.equal(summary.verdictCounts.adopt, 2);
    assert.equal(summary.verdictCounts.hand_off_to_forge, 1);
    assert.equal(summary.verdictCounts.stay_experimental, 1);
    assert.equal(summary.usefulnessCounts.meta, 1);
    assert.equal(summary.artifactTypeCounts["shared-lib"], 1);
    assert.equal(summary.completionStatusCounts.product_materialized, 2);
    assert.equal(summary.completionStatusCounts.routed_out_of_architecture, 1);
    assert.equal(summary.forgeHandoffRequiredCount, 1);
    assert.equal(summary.stayExperimentalCount, 1);
    assert.equal(
      summary.metaSelfImprovementCategoryCounts.evaluation_quality,
      1,
    );

    checks.push({
      id: "architecture-cycle-decision-summary-executable-lane",
      ok: true,
      reason: null,
    });
  } catch (error) {
    checks.push({
      id: "architecture-cycle-decision-summary-executable-lane",
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
