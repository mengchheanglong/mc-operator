import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const waveLoaderLibPath = path.join(
    root,
    "workspace",
    "directive-workspace",
    "shared",
    "lib",
    "architecture-cycle-decision-loader.ts",
  );
  const closeoutScriptPath = path.join(
    process.cwd(),
    "scripts",
    "close-directive-architecture-slice.ts",
  );
  const waveScriptPath = path.join(
    process.cwd(),
    "scripts",
    "evaluate-directive-architecture-wave.ts",
  );
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");
  const issues: string[] = [];

  if (!fs.existsSync(waveLoaderLibPath)) {
    issues.push("missing architecture cycle decision loader lib");
  }
  if (!fs.existsSync(closeoutScriptPath)) {
    issues.push("missing architecture closeout script");
  }
  if (!fs.existsSync(waveScriptPath)) {
    issues.push("missing architecture wave evaluation script");
  }
  if (!fs.existsSync(tsxPath)) {
    issues.push("missing tsx runner");
  }

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-architecture-wave-"));
  const tempDirectiveRoot = path.join(tempDir, "directive-workspace");
  const cases = [
    {
      recordRelativePath:
        "architecture/03-adopted/2026-03-23-wave-eval-adopted.md",
      request: {
        sourceId: "dw-src-wave-eval-adopt",
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
        artifactPath: "shared/lib/example-wave-eval.ts",
      },
    },
    {
      recordRelativePath:
        "architecture/03-adopted/2026-03-23-wave-eval-forge-handoff.md",
      request: {
        sourceId: "dw-src-wave-eval-forge",
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
        artifactPath: "architecture/03-adopted/2026-03-23-wave-eval-forge-handoff.md",
        forgeHandoffRef: "forge/handoff/2026-03-23-wave-eval-forge-handoff.md",
      },
    },
    {
      recordRelativePath:
        "architecture/02-experiments/2026-03-23-wave-eval-stay-experimental.md",
      request: {
        sourceId: "dw-src-wave-eval-stay-experimental",
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
          "architecture/02-experiments/2026-03-23-wave-eval-stay-experimental.md",
      },
    },
  ] as const;

  try {
    for (const testCase of cases) {
      const recordAbsolutePath = path.join(
        tempDirectiveRoot,
        testCase.recordRelativePath,
      );
      fs.mkdirSync(path.dirname(recordAbsolutePath), { recursive: true });
      fs.writeFileSync(recordAbsolutePath, "# architecture wave evaluation record\n", "utf8");

      const requestPath = path.join(
        tempDir,
        `${path.basename(testCase.recordRelativePath, ".md")}.json`,
      );
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

      execFileSync(
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
    }

    const waveRequestPath = path.join(tempDir, "wave-evaluation.json");
    writeJson(waveRequestPath, {
      recordRelativePaths: cases.map((testCase) => testCase.recordRelativePath),
    });

    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `& '${tsxPath}' '${waveScriptPath}' --input-json-path '${waveRequestPath}' --directive-root '${tempDirectiveRoot}'`,
      ],
      { encoding: "utf8" },
    );

    const result = JSON.parse(output) as {
      ok: boolean;
      reviewedRecords: Array<{ verdict: string }>;
      summary: {
        totalArtifactsReviewed: number;
        verdictCounts: Record<string, number>;
        forgeHandoffRequiredCount: number;
        stayExperimentalCount: number;
      };
    };

    assert.equal(result.ok, true);
    assert.equal(result.reviewedRecords.length, 3);
    assert.equal(result.summary.totalArtifactsReviewed, 3);
    assert.equal(result.summary.verdictCounts.adopt, 1);
    assert.equal(result.summary.verdictCounts.hand_off_to_forge, 1);
    assert.equal(result.summary.verdictCounts.stay_experimental, 1);
    assert.equal(result.summary.forgeHandoffRequiredCount, 1);
    assert.equal(result.summary.stayExperimentalCount, 1);
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
