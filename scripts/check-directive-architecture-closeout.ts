import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isDirectiveArchitectureAdoptionDecisionArtifact,
  type DirectiveArchitectureAdoptionDecisionArtifact,
} from "../src/lib/directive-workspace/architecture-adoption-artifacts";
import {
  summarizeDirectiveArchitectureCycleDecisions,
} from "../src/lib/directive-workspace/architecture-cycle-decision-summary";

type CloseoutCase = {
  id: string;
  recordRelativePath: string;
  expectedRecordState: "experiment" | "adopted";
  expectedCloseoutState: "stay_experimental" | "adopted" | "forge_handoff";
  expectedVerdict: "adopt" | "stay_experimental" | "hand_off_to_forge";
  request: Record<string, unknown>;
};

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const closeoutLibPath = path.join(
    root,
    "workspace",
    "directive-workspace",
    "shared",
    "lib",
    "architecture-closeout.ts",
  );
  const closeoutScriptPath = path.join(
    process.cwd(),
    "scripts",
    "close-directive-architecture-slice.ts",
  );
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");
  const issues: string[] = [];

  if (!fs.existsSync(closeoutLibPath)) {
    issues.push("missing architecture closeout lib");
  }
  if (!fs.existsSync(closeoutScriptPath)) {
    issues.push("missing architecture closeout script");
  }
  if (!fs.existsSync(tsxPath)) {
    issues.push("missing tsx runner");
  }

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-architecture-closeout-"));
  const tempDirectiveRoot = path.join(tempDir, "directive-workspace");
  const artifacts: DirectiveArchitectureAdoptionDecisionArtifact[] = [];

  const cases: CloseoutCase[] = [
    {
      id: "adopt",
      recordRelativePath:
        "architecture/03-adopted/2026-03-23-closeout-adopted.md",
      expectedRecordState: "adopted",
      expectedCloseoutState: "adopted",
      expectedVerdict: "adopt",
      request: {
        sourceId: "dw-src-architecture-closeout-adopt",
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
        artifactPath: "shared/lib/example-closeout-adopt.ts",
      },
    },
    {
      id: "forge-handoff",
      recordRelativePath:
        "architecture/03-adopted/2026-03-23-closeout-forge-handoff.md",
      expectedRecordState: "adopted",
      expectedCloseoutState: "forge_handoff",
      expectedVerdict: "hand_off_to_forge",
      request: {
        sourceId: "dw-src-architecture-closeout-forge",
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
        artifactPath: "architecture/03-adopted/2026-03-23-closeout-forge-handoff.md",
        forgeHandoffRef: "forge/handoff/2026-03-23-closeout-forge-handoff.md",
      },
    },
    {
      id: "stay-experimental",
      recordRelativePath:
        "architecture/02-experiments/2026-03-23-closeout-stay-experimental.md",
      expectedRecordState: "experiment",
      expectedCloseoutState: "stay_experimental",
      expectedVerdict: "stay_experimental",
      request: {
        sourceId: "dw-src-architecture-closeout-stay-experimental",
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
        artifactPath:
          "architecture/02-experiments/2026-03-23-closeout-stay-experimental.md",
      },
    },
  ];

  try {
    for (const testCase of cases) {
      const recordAbsolutePath = path.join(
        tempDirectiveRoot,
        testCase.recordRelativePath,
      );
      fs.mkdirSync(path.dirname(recordAbsolutePath), { recursive: true });
      fs.writeFileSync(recordAbsolutePath, "# architecture closeout record\n", "utf8");

      const requestPath = path.join(tempDir, `${testCase.id}.json`);
      writeJson(requestPath, {
        ...testCase.request,
        recordRelativePath: testCase.recordRelativePath,
        reviewInput: {
          candidateId: String(testCase.request.sourceId),
          checks: {
            state_visibility_check: "pass",
            rollback_check: "pass",
            scope_isolation_check: "pass",
            validation_link_check: "pass",
            ownership_boundary_check: "pass",
            packet_consumption_check: "pass",
            artifact_evidence_continuity_check: "pass",
          },
        },
      });

      const output = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${closeoutScriptPath}' --input-json-path '${requestPath}' --directive-root '${tempDirectiveRoot}'`,
        ],
        { encoding: "utf8" },
      );
      const result = JSON.parse(output) as Record<string, unknown>;
      assert.equal(result.ok, true);
      assert.equal(result.recordState, testCase.expectedRecordState);
      assert.equal(result.closeoutState, testCase.expectedCloseoutState);
      assert.equal(result.verdict, testCase.expectedVerdict);

      const outputRelativePath = String(result.outputRelativePath || "");
      const outputAbsolutePath = path.join(tempDirectiveRoot, outputRelativePath);
      assert.equal(fs.existsSync(outputAbsolutePath), true);

      const parsed = JSON.parse(
        fs.readFileSync(outputAbsolutePath, "utf8"),
      ) as unknown;
      assert.equal(isDirectiveArchitectureAdoptionDecisionArtifact(parsed), true);
      artifacts.push(parsed as DirectiveArchitectureAdoptionDecisionArtifact);
    }

    const summary = summarizeDirectiveArchitectureCycleDecisions({
      adoptionArtifacts: artifacts,
    });
    assert.equal(summary.totalArtifactsReviewed, 3);
    assert.equal(summary.verdictCounts.adopt, 1);
    assert.equal(summary.verdictCounts.hand_off_to_forge, 1);
    assert.equal(summary.verdictCounts.stay_experimental, 1);
    assert.equal(summary.forgeHandoffRequiredCount, 1);
    assert.equal(summary.stayExperimentalCount, 1);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  fs.rmSync(tempDir, { recursive: true, force: true });

  const ok = issues.length === 0;
  console.log(
    JSON.stringify(
      {
        ok,
        metrics: {
          generatedArtifacts: artifacts.length,
          failedChecks: issues.length,
        },
        issues,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(1);
}

main();
