import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isDirectiveArchitectureAdoptionDecisionArtifact,
  type DirectiveArchitectureAdoptionDecisionArtifact,
} from "../src/lib/directive-workspace/architecture-adoption-artifacts";
import {
  summarizeDirectiveArchitectureCycleDecisions,
} from "../src/lib/directive-workspace/architecture-cycle-decision-summary";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

const ADOPTION_DECISION_FILES = [
  "2026-03-23-openmoss-review-feedback-lib-adoption-decision.json",
  "2026-03-23-architecture-review-resolution-lib-adoption-decision.json",
  "2026-03-23-architecture-adoption-resolution-lib-adoption-decision.json",
  "2026-03-23-architecture-adoption-artifacts-lib-adoption-decision.json",
  "2026-03-23-architecture-cycle-decision-summary-lib-adoption-decision.json",
  "2026-03-23-scientify-literature-monitoring-forge-handoff-adoption-decision.json",
] as const;

function readJsonFile(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const adoptedDir = path.join(directiveRoot, "architecture", "03-adopted");
  const checks: Check[] = [];

  const artifacts: DirectiveArchitectureAdoptionDecisionArtifact[] = [];

  for (const fileName of ADOPTION_DECISION_FILES) {
    const fullPath = path.join(adoptedDir, fileName);
    if (!fs.existsSync(fullPath)) {
      checks.push({
        id: `adoption-decision-file-${fileName}`,
        ok: false,
        reason: `missing adoption decision artifact: ${fullPath}`,
      });
      continue;
    }

    const parsed = readJsonFile(fullPath);
    const valid = isDirectiveArchitectureAdoptionDecisionArtifact(parsed);
    checks.push({
      id: `adoption-decision-valid-${fileName}`,
      ok: valid,
      reason: valid ? null : `invalid adoption decision artifact shape: ${fullPath}`,
    });
    if (valid) {
      artifacts.push(parsed);
    }
  }

  try {
    const summary = summarizeDirectiveArchitectureCycleDecisions({
      adoptionArtifacts: artifacts,
    });

    assert.equal(summary.totalArtifactsReviewed, 6);
    assert.equal(summary.verdictCounts.adopt, 5);
    assert.equal(summary.verdictCounts.hand_off_to_forge, 1);
    assert.equal(summary.usefulnessCounts.meta, 5);
    assert.equal(summary.usefulnessCounts.direct, 1);
    assert.equal(summary.artifactTypeCounts["shared-lib"], 5);
    assert.equal(summary.artifactTypeCounts.contract, 1);
    assert.equal(summary.completionStatusCounts.product_materialized, 5);
    assert.equal(summary.completionStatusCounts.routed_out_of_architecture, 1);
    assert.equal(summary.forgeHandoffRequiredCount, 1);
    assert.equal(summary.stayExperimentalCount, 0);
    assert.equal(
      summary.metaSelfImprovementCategoryCounts.evaluation_quality,
      4,
    );
    assert.equal(
      summary.metaSelfImprovementCategoryCounts.handoff_quality,
      1,
    );

    checks.push({
      id: "architecture-adoption-decision-corpus-summary",
      ok: true,
      reason: null,
    });
  } catch (error) {
    checks.push({
      id: "architecture-adoption-decision-corpus-summary",
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
      adoptionDecisionArtifacts: artifacts.length,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.ok) process.exit(1);
}

main();
