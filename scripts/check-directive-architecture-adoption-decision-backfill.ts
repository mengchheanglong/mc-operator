import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  isDirectiveArchitectureAdoptionDecisionArtifact,
  type DirectiveArchitectureAdoptionDecisionArtifact,
} from "../src/lib/directive-workspace/architecture-adoption-artifacts";
import {
  summarizeDirectiveArchitectureCycleDecisions,
} from "../src/lib/directive-workspace/architecture-cycle-decision-summary";
import {
  resolveDirectiveArchitectureAdoptionDecisionPath,
} from "../src/lib/directive-workspace/architecture-adoption-decision-writer";

const ADOPTED_RECORD_PATHS = [
  "architecture/03-adopted/2026-03-23-openmoss-review-feedback-lib-adopted.md",
  "architecture/03-adopted/2026-03-23-architecture-review-resolution-lib-adopted.md",
  "architecture/03-adopted/2026-03-23-architecture-adoption-resolution-lib-adopted.md",
  "architecture/03-adopted/2026-03-23-architecture-adoption-artifacts-lib-adopted.md",
  "architecture/03-adopted/2026-03-23-architecture-cycle-decision-summary-lib-adopted.md",
  "architecture/03-adopted/2026-03-23-scientify-literature-monitoring-forge-handoff.md",
] as const;

function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const backfillScriptPath = path.join(
    process.cwd(),
    "scripts",
    "backfill-directive-architecture-adoption-decision-corpus.ts",
  );
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx.cmd");
  const issues: string[] = [];

  if (!fs.existsSync(backfillScriptPath)) {
    issues.push("missing architecture adoption decision corpus backfill script");
  }
  if (!fs.existsSync(tsxPath)) {
    issues.push("missing tsx runner");
  }

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "dw-architecture-adoption-backfill-"),
  );
  const tempDirectiveRoot = path.join(tempDir, "directive-workspace");

  for (const relativePath of ADOPTED_RECORD_PATHS) {
    const absolutePath = path.join(tempDirectiveRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, "# dry run adopted record\n", "utf8");
  }

  try {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `& '${tsxPath}' '${backfillScriptPath}' --directive-root '${tempDirectiveRoot}'`,
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    issues.push(
      `architecture adoption decision corpus backfill failed: ${String((error as Error).message || error)}`,
    );
  }

  const artifacts: DirectiveArchitectureAdoptionDecisionArtifact[] = [];
  for (const relativePath of ADOPTED_RECORD_PATHS) {
    const expectedRelativePath = resolveDirectiveArchitectureAdoptionDecisionPath({
      adoptedRecordRelativePath: relativePath,
      sourceId: "dw-check-adoption-decision-backfill",
      sourceTitle: "Backfill proof artifact",
      sourceKind: "internal",
      usefulnessLevel: "structural",
      artifactType: "contract",
      completionStatus: "complete",
    });
    const expectedJsonPath = path.join(
      tempDirectiveRoot,
      expectedRelativePath,
    );
    if (!fs.existsSync(expectedJsonPath)) {
      issues.push(`missing generated adoption decision artifact: ${expectedJsonPath}`);
      continue;
    }

    const parsed = JSON.parse(fs.readFileSync(expectedJsonPath, "utf8")) as unknown;
    if (!isDirectiveArchitectureAdoptionDecisionArtifact(parsed)) {
      issues.push(`invalid generated adoption decision artifact: ${expectedJsonPath}`);
      continue;
    }
    artifacts.push(parsed);
  }

  if (artifacts.length === ADOPTED_RECORD_PATHS.length) {
    const summary = summarizeDirectiveArchitectureCycleDecisions({
      adoptionArtifacts: artifacts,
    });
    if (summary.totalArtifactsReviewed !== 6) {
      issues.push("generated adoption decision corpus review count mismatch");
    }
    if (summary.verdictCounts.adopt !== 5) {
      issues.push("generated adoption decision corpus adopt count mismatch");
    }
    if (summary.verdictCounts.hand_off_to_forge !== 1) {
      issues.push("generated adoption decision corpus Forge handoff count mismatch");
    }
    if (summary.usefulnessCounts.meta !== 5) {
      issues.push("generated adoption decision corpus meta count mismatch");
    }
    if (summary.forgeHandoffRequiredCount !== 1) {
      issues.push("generated adoption decision corpus Forge requirement mismatch");
    }
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
