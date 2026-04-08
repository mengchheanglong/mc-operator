import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  isDirectiveArchitectureAdoptionDecisionArtifact,
} from "../src/lib/directive-workspace/architecture-adoption-artifacts";

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const directiveRoot = path.join(root, "workspace", "directive-workspace");
  const writerLibPath = path.join(
    directiveRoot,
    "shared",
    "lib",
    "architecture-adoption-decision-writer.ts",
  );
  const writerScriptPath = path.join(
    process.cwd(),
    "scripts",
    "write-directive-architecture-adoption-decision.ts",
  );
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  if (!fs.existsSync(writerLibPath)) {
    issues.push("missing architecture adoption decision writer lib");
  }
  if (!fs.existsSync(writerScriptPath)) {
    issues.push("missing architecture adoption decision writer script");
  }
  if (!fs.existsSync(tsxPath)) {
    issues.push("missing tsx runner");
  }

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "dw-architecture-adoption-writer-"),
  );
  const tempDirectiveRoot = path.join(tempDir, "directive-workspace");
  const adoptedRecordPath = path.join(
    tempDirectiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-23-dry-run-architecture-adoption.md",
  );
  const requestPath = path.join(tempDir, "adoption-decision-request.json");
  const expectedOutputPath = path.join(
    tempDirectiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-23-dry-run-architecture-adoption-adoption-decision.json",
  );

  fs.mkdirSync(path.dirname(adoptedRecordPath), { recursive: true });
  fs.writeFileSync(adoptedRecordPath, "# dry run adopted record\n", "utf8");

  writeJson(requestPath, {
    sourceId: "dw-src-dry-run-architecture-adoption-writer",
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
    improvementQuality: "strong",
    productArtifactMaterialized: true,
    proofExecuted: true,
    targetArtifactClarified: true,
    valuableWithoutRuntimeSurface: true,
    metaSelfImprovementCategory: "evaluation_quality",
    artifactPath: "shared/lib/example-generated-adoption.ts",
    adoptedRecordRelativePath:
      "architecture/03-adopted/2026-03-23-dry-run-architecture-adoption.md",
    adoptionDate: "2026-03-23",
    sourceAnalysisRef:
      "architecture/02-experiments/2026-03-23-example-source-analysis.md",
    adaptationDecisionRef:
      "architecture/02-experiments/2026-03-23-example-adaptation.md",
    selfImprovement: {
      category: "evaluation_quality",
      claim:
        "Retained adoption-decision artifacts make later cycle evaluation less prose-dependent.",
      mechanism:
        "Write the decision artifact beside the adopted record by default.",
      baselineObservation:
        "Architecture adoption-decision JSON artifacts were previously hand-authored backfills.",
      expectedEffect:
        "Later Architecture waves can consume retained decision state directly from adopted records.",
      verificationMethod: "next_cycle_comparison",
      verificationResult: "not_yet_verified",
    },
    reviewInput: {
      candidateId: "dw-src-dry-run-architecture-adoption-writer",
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

  try {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `& '${tsxPath}' '${writerScriptPath}' --input-json-path '${requestPath}' --directive-root '${tempDirectiveRoot}'`,
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    issues.push(
      `architecture adoption decision writer failed: ${String((error as Error).message || error)}`,
    );
  }

  if (!fs.existsSync(expectedOutputPath)) {
    issues.push("adoption decision artifact file was not created");
  } else {
    const parsed = JSON.parse(
      fs.readFileSync(expectedOutputPath, "utf8"),
    ) as unknown;
    if (!isDirectiveArchitectureAdoptionDecisionArtifact(parsed)) {
      issues.push("written adoption decision artifact shape is invalid");
    } else {
      if (parsed.decision.verdict !== "adopt") {
        issues.push("written artifact verdict mismatch");
      }
      if (parsed.artifact_path !== "shared/lib/example-generated-adoption.ts") {
        issues.push("written artifact path mismatch");
      }
    }
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
