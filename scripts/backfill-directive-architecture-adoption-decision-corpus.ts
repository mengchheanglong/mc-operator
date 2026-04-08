import fs from "node:fs";
import path from "node:path";
import {
  buildDirectiveArchitectureAdoptionDecisionFile,
  type DirectiveArchitectureAdoptionDecisionWriteRequest,
} from "../src/lib/directive-workspace/architecture-adoption-decision-writer";
import {
  upsertDirectiveArchitectureAdoptionDecisionArtifact,
} from "../src/lib/directive-workspace/architecture-adoption-decision-store";
import type {
  ArchitectureReviewResolutionInput,
} from "../src/lib/directive-workspace/architecture-review-resolution";

function parseArgs(argv: string[]) {
  const args = {
    directiveRoot: "",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--directive-root") {
      args.directiveRoot = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function passedReviewInput(candidateId: string): ArchitectureReviewResolutionInput {
  return {
    candidateId,
    checks: {
      state_visibility_check: "pass",
      rollback_check: "pass",
      scope_isolation_check: "pass",
      validation_link_check: "pass",
      ownership_boundary_check: "pass",
      packet_consumption_check: "pass",
      artifact_evidence_continuity_check: "pass",
    },
  };
}

function metaSharedLibRequest(input: {
  sourceId: string;
  adoptedRecordRelativePath: string;
  artifactPath: string;
  sourceAnalysisRef?: string;
  adaptationDecisionRef?: string;
  improvementQuality: "strong" | "adequate";
  metaCategory: "evaluation_quality" | "handoff_quality";
  claim: string;
  mechanism: string;
  baselineObservation: string;
  expectedEffect: string;
  verificationNotes: string;
  rationale: string;
}): DirectiveArchitectureAdoptionDecisionWriteRequest {
  return {
    sourceId: input.sourceId,
    adoptionDate: "2026-03-23",
    adoptedRecordRelativePath: input.adoptedRecordRelativePath,
    sourceAnalysisRef: input.sourceAnalysisRef,
    adaptationDecisionRef: input.adaptationDecisionRef,
    usefulnessLevel: "meta",
    valueShape: "executable_logic",
    readinessCheck: {
      source_analysis_complete: true,
      adaptation_decision_complete: true,
      adaptation_quality_acceptable: true,
      delta_evidence_present: true,
      no_unresolved_baggage: true,
    },
    adaptationQuality: "strong",
    improvementQuality: input.improvementQuality,
    productArtifactMaterialized: true,
    proofExecuted: true,
    targetArtifactClarified: true,
    valuableWithoutRuntimeSurface: true,
    metaSelfImprovementCategory: input.metaCategory,
    artifactPath: input.artifactPath,
    selfImprovement: {
      category: input.metaCategory,
      claim: input.claim,
      mechanism: input.mechanism,
      baselineObservation: input.baselineObservation,
      expectedEffect: input.expectedEffect,
      verificationMethod: "structural_inspection",
      verificationResult: "confirmed",
      verificationDate: "2026-03-23",
      verificationNotes: input.verificationNotes,
    },
    reviewInput: passedReviewInput(input.sourceId),
  };
}

function buildCorpusRequests(): DirectiveArchitectureAdoptionDecisionWriteRequest[] {
  return [
    metaSharedLibRequest({
      sourceId: "dw-src-openmoss-review-feedback-lib",
      adoptedRecordRelativePath:
        "architecture/03-adopted/2026-03-23-openmoss-review-feedback-lib-adopted.md",
      artifactPath: "shared/lib/lifecycle-review-feedback.ts",
      sourceAnalysisRef:
        "architecture/02-experiments/2026-03-23-openmoss-review-feedback-lib-source-analysis.md",
      adaptationDecisionRef:
        "architecture/02-experiments/2026-03-23-openmoss-review-feedback-lib-adaptation.md",
      improvementQuality: "strong",
      metaCategory: "evaluation_quality",
      claim:
        "Directive review and lifecycle loops will drift less because lifecycle and score-feedback behavior now exists as one canonical helper.",
      mechanism:
        "Lifecycle transition validation, review-score deltas, and blocked recovery planning are now implemented in one product-owned shared lib.",
      baselineObservation:
        "Directive Workspace had lifecycle and score-feedback contracts but no canonical executable helper implementing them.",
      expectedEffect:
        "Later review-oriented Architecture work can import one helper instead of re-deriving transition and score logic from prose.",
      verificationNotes:
        "The helper is now consumed by the Architecture review-resolution lane.",
      rationale:
        "The extracted OpenMOSS mechanism passed adaptation readiness, excluded runtime baggage, and remains valuable as Directive-owned Architecture code.",
    }),
    metaSharedLibRequest({
      sourceId: "dw-src-architecture-review-resolution-lib",
      adoptedRecordRelativePath:
        "architecture/03-adopted/2026-03-23-architecture-review-resolution-lib-adopted.md",
      artifactPath: "shared/lib/architecture-review-resolution.ts",
      improvementQuality: "adequate",
      metaCategory: "evaluation_quality",
      claim:
        "Architecture review outcomes will become more comparable and less prose-dependent because review scoring and next-state resolution now run through one canonical helper.",
      mechanism:
        "The review lane now resolves required checks, anti-pattern penalties, review result, and next lifecycle transition in product-owned code.",
      baselineObservation:
        "Architecture review doctrine existed, but review score and next-state resolution still depended on checklist interpretation.",
      expectedEffect:
        "Future review-oriented slices can use one deterministic review path instead of re-deriving outcome logic from Markdown.",
      verificationNotes:
        "The Impeccable Architecture review check now consumes the executable review resolver.",
      rationale:
        "The review lane passed readiness, materialized a reusable shared lib, and improves Directive Workspace's internal evaluation quality.",
    }),
    metaSharedLibRequest({
      sourceId: "dw-src-architecture-adoption-resolution-lib",
      adoptedRecordRelativePath:
        "architecture/03-adopted/2026-03-23-architecture-adoption-resolution-lib-adopted.md",
      artifactPath: "shared/lib/architecture-adoption-resolution.ts",
      improvementQuality: "adequate",
      metaCategory: "handoff_quality",
      claim:
        "Architecture will route retained value versus Forge handoff more consistently because the Decide step now resolves that split in code.",
      mechanism:
        "The adoption resolver combines review result, readiness gates, artifact selection, completion status, and Forge threshold logic in one canonical path.",
      baselineObservation:
        "Before this helper, Architecture review could pass while adoption versus Forge handoff remained partly implicit across prose and checker expectations.",
      expectedEffect:
        "Future Decide-step work will produce more consistent stay-experimental versus adopt versus Forge-handoff outcomes.",
      verificationNotes:
        "The adoption-artifact builder and cycle-decision summary lane now consume the canonical adoption resolver.",
      rationale:
        "The Decide step now has canonical product-owned judgment for adoption readiness, completion status, and Forge threshold resolution.",
    }),
    metaSharedLibRequest({
      sourceId: "dw-src-architecture-adoption-artifacts-lib",
      adoptedRecordRelativePath:
        "architecture/03-adopted/2026-03-23-architecture-adoption-artifacts-lib-adopted.md",
      artifactPath: "shared/lib/architecture-adoption-artifacts.ts",
      improvementQuality: "strong",
      metaCategory: "evaluation_quality",
      claim:
        "Architecture cycle and review lanes will compare Decide-step outcomes with less drift because adoption decisions can now be emitted in one schema-shaped form.",
      mechanism:
        "The adoption-artifact builder converts canonical Decide-step resolution into the machine-readable architecture-adoption-decision schema.",
      baselineObservation:
        "The Decide step had a schema and a resolver, but final decision artifacts still depended on prose records and checker-specific reconstruction.",
      expectedEffect:
        "Later self-improvement work can compare generated adoption decisions directly instead of reinterpreting adopted prose.",
      verificationNotes:
        "The cycle-decision summary lane now consumes generated adoption artifacts instead of only synthetic resolver output.",
      rationale:
        "The canonical builder materializes Architecture adoption decisions in schema-shaped product-owned form and removes prose-only drift from the Decide step.",
    }),
    metaSharedLibRequest({
      sourceId: "dw-src-architecture-cycle-decision-summary-lib",
      adoptedRecordRelativePath:
        "architecture/03-adopted/2026-03-23-architecture-cycle-decision-summary-lib-adopted.md",
      artifactPath: "shared/lib/architecture-cycle-decision-summary.ts",
      improvementQuality: "strong",
      metaCategory: "evaluation_quality",
      claim:
        "Architecture cycle evaluation will compare waves more reliably because generated adoption artifacts can now be summarized directly into decision metrics.",
      mechanism:
        "The cycle-decision summary helper aggregates verdict, usefulness, artifact-type, completion-status, Forge-handoff, and self-improvement-category counts from machine-readable adoption artifacts.",
      baselineObservation:
        "Cycle evaluation templates had no executable lane for aggregating decision composition from generated adoption artifacts.",
      expectedEffect:
        "Future cycle evaluations can anchor decision composition to generated artifacts instead of only prose adopted records.",
      verificationNotes:
        "This slice now has an on-disk decision-artifact corpus and a corpus checker consuming it.",
      rationale:
        "The cycle-evaluation lane now consumes machine-readable adoption decisions and reduces interpretation drift across Architecture waves.",
    }),
    {
      sourceId: "scientify-literature-monitoring",
      adoptionDate: "2026-03-23",
      adoptedRecordRelativePath:
        "architecture/03-adopted/2026-03-23-scientify-literature-monitoring-forge-handoff.md",
      sourceAnalysisRef:
        "architecture/02-experiments/2026-03-23-scientify-mixed-value-partition-source-analysis.md",
      adaptationDecisionRef:
        "architecture/02-experiments/2026-03-23-scientify-mixed-value-partition-adaptation.md",
      usefulnessLevel: "direct",
      valueShape: "interface_or_handoff",
      readinessCheck: {
        source_analysis_complete: true,
        adaptation_decision_complete: true,
        adaptation_quality_acceptable: true,
        delta_evidence_present: true,
        no_unresolved_baggage: true,
      },
      adaptationQuality: "strong",
      improvementQuality: "strong",
      proofExecuted: true,
      targetArtifactClarified: true,
      remainingValueIsRuntimeCapability: true,
      requiresHostIntegration: true,
      architectureValueCaptured: true,
      explicitForgeHandoffReady: true,
      valuableWithoutRuntimeSurface: false,
      artifactPath:
        "architecture/03-adopted/2026-03-23-scientify-literature-monitoring-forge-handoff.md",
      forgeHandoffRef:
        "forge/handoff/2026-03-23-scientify-literature-monitoring-architecture-to-forge-handoff.md",
      reviewInput: passedReviewInput("scientify-literature-monitoring"),
    },
  ];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const directiveRoot =
    args.directiveRoot || path.resolve(process.cwd(), "..", "directive-workspace");
  const requests = buildCorpusRequests();
  const outputs: Array<{
    sourceId: string;
    outputRelativePath: string;
    verdict: string;
  }> = [];

  for (const request of requests) {
    const adoptedRecordAbsolutePath = path.resolve(
      directiveRoot,
      request.adoptedRecordRelativePath,
    );
    if (!fs.existsSync(adoptedRecordAbsolutePath)) {
      throw new Error(
        `Adopted Architecture record not found for corpus backfill: ${adoptedRecordAbsolutePath}`,
      );
    }

    const file = buildDirectiveArchitectureAdoptionDecisionFile(request);

    if (!args.dryRun) {
      upsertDirectiveArchitectureAdoptionDecisionArtifact({
        directiveRoot,
        recordRelativePath: request.adoptedRecordRelativePath,
        outputRelativePath: file.relativePath,
        artifact: file.artifact,
      });
    }

    outputs.push({
      sourceId: request.sourceId,
      outputRelativePath: file.relativePath,
      verdict: file.artifact.decision.verdict,
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: args.dryRun ? "dry_run" : "written",
        directiveRoot,
        count: outputs.length,
        outputs,
      },
      null,
      2,
    )}\n`,
  );
}

main();
