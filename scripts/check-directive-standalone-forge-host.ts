import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const standaloneHostRoot = path.resolve(directiveRoot, "hosts", "standalone-host");
  const cliPath = path.resolve(standaloneHostRoot, "cli.ts");
  const forgePath = path.resolve(standaloneHostRoot, "forge.ts");
  const forgeFollowUpExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-follow-up.example.json",
  );
  const forgeRecordExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-record.example.json",
  );
  const forgeProofExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-proof-bundle.example.json",
  );
  const forgeTransformationProofExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-transformation-proof.example.json",
  );
  const forgeTransformationRecordExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-transformation-record.example.json",
  );
  const forgePromotionExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-promotion-record.example.json",
  );
  const forgeRegistryExamplePath = path.resolve(
    standaloneHostRoot,
    "examples",
    "forge-registry-entry.example.json",
  );
  const tsxPath = path.resolve(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  const requiredPaths = [
    cliPath,
    forgePath,
    forgeFollowUpExamplePath,
    forgeRecordExamplePath,
    forgeProofExamplePath,
    forgeTransformationProofExamplePath,
    forgeTransformationRecordExamplePath,
    forgePromotionExamplePath,
    forgeRegistryExamplePath,
    tsxPath,
  ];
  const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));
  if (missingPaths.length > 0) {
    issues.push(...missingPaths.map((filePath) => `missing standalone Forge host asset: ${filePath}`));
  }

  if (issues.length > 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, issues }, null, 2)}\n`);
    process.exit(1);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dw-standalone-forge-host-check-"));
  const runtimeDirectiveRoot = path.resolve(tempRoot, "directive-runtime");

  let followUpOutput: Record<string, unknown> | null = null;
  let recordOutput: Record<string, unknown> | null = null;
  let proofOutput: Record<string, unknown> | null = null;
  let transformationProofOutput: Record<string, unknown> | null = null;
  let transformationRecordOutput: Record<string, unknown> | null = null;
  let promotionOutput: Record<string, unknown> | null = null;
  let registryOutput: Record<string, unknown> | null = null;
  let overviewOutput: Record<string, unknown> | null = null;

  try {
    followUpOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-followup-write --directive-root '${runtimeDirectiveRoot}' --input-json-path '${forgeFollowUpExamplePath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    recordOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-record-write --directive-root '${runtimeDirectiveRoot}' --input-json-path '${forgeRecordExamplePath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    proofOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-proof-write --directive-root '${runtimeDirectiveRoot}' --input-json-path '${forgeProofExamplePath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    transformationProofOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-transformation-proof-write --directive-root '${runtimeDirectiveRoot}' --input-json-path '${forgeTransformationProofExamplePath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    transformationRecordOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-transformation-record-write --directive-root '${runtimeDirectiveRoot}' --input-json-path '${forgeTransformationRecordExamplePath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    promotionOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-promotion-write --directive-root '${runtimeDirectiveRoot}' --input-json-path '${forgePromotionExamplePath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    registryOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-registry-write --directive-root '${runtimeDirectiveRoot}' --input-json-path '${forgeRegistryExamplePath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    overviewOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-overview --directive-root '${runtimeDirectiveRoot}' --max-entries 7`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;
  } catch (error) {
    issues.push(`standalone Forge host CLI invocation failed: ${String((error as Error).message || error)}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  if (!followUpOutput || followUpOutput.ok !== true) {
    issues.push("standalone Forge follow-up write failed");
  } else if (typeof followUpOutput.path !== "string") {
    issues.push("standalone Forge follow-up write must return the written artifact path");
  }

  if (!recordOutput || recordOutput.ok !== true) {
    issues.push("standalone Forge record write failed");
  } else if (typeof recordOutput.path !== "string") {
    issues.push("standalone Forge record write must return the written artifact path");
  }

  if (!proofOutput || proofOutput.ok !== true) {
    issues.push("standalone Forge proof write failed");
  } else {
    if (typeof proofOutput.path !== "string") {
      issues.push("standalone Forge proof write must return the written checklist path");
    }
    if (typeof proofOutput.gateSnapshotPath !== "string") {
      issues.push("standalone Forge proof write must return the written gate snapshot path");
    }
  }

  if (!transformationProofOutput || transformationProofOutput.ok !== true) {
    issues.push("standalone Forge transformation proof write failed");
  } else if (typeof transformationProofOutput.path !== "string") {
    issues.push("standalone Forge transformation proof write must return the written artifact path");
  }

  if (!transformationRecordOutput || transformationRecordOutput.ok !== true) {
    issues.push("standalone Forge transformation record write failed");
  } else if (typeof transformationRecordOutput.path !== "string") {
    issues.push("standalone Forge transformation record write must return the written artifact path");
  }

  if (!promotionOutput || promotionOutput.ok !== true) {
    issues.push("standalone Forge promotion write failed");
  } else if (typeof promotionOutput.path !== "string") {
    issues.push("standalone Forge promotion write must return the written artifact path");
  }

  if (!registryOutput || registryOutput.ok !== true) {
    issues.push("standalone Forge registry write failed");
  } else if (typeof registryOutput.path !== "string") {
    issues.push("standalone Forge registry write must return the written artifact path");
  }

  if (!overviewOutput || overviewOutput.ok !== true) {
    issues.push("standalone Forge overview failed");
  } else {
    const overview = overviewOutput.overview as Record<string, unknown> | undefined;
    const followUpCount = Number(overview?.followUpCount ?? 0);
    const recordCount = Number(overview?.recordCount ?? 0);
    const proofBundleCount = Number(overview?.proofBundleCount ?? 0);
    const transformationRecordCount = Number(overview?.transformationRecordCount ?? 0);
    const transformationProofCount = Number(overview?.transformationProofCount ?? 0);
    const promotionRecordCount = Number(overview?.promotionRecordCount ?? 0);
    const registryEntryCount = Number(overview?.registryEntryCount ?? 0);
    const recentEntries = Array.isArray(overview?.recentEntries)
      ? overview.recentEntries
      : [];
    if (followUpCount < 1) {
      issues.push("standalone Forge overview must report at least one follow-up artifact");
    }
    if (recordCount < 1) {
      issues.push("standalone Forge overview must report at least one Forge record artifact");
    }
    if (proofBundleCount < 1) {
      issues.push("standalone Forge overview must report at least one Forge proof bundle");
    }
    if (transformationRecordCount < 1) {
      issues.push("standalone Forge overview must report at least one Forge transformation record");
    }
    if (transformationProofCount < 1) {
      issues.push("standalone Forge overview must report at least one Forge transformation proof");
    }
    if (promotionRecordCount < 1) {
      issues.push("standalone Forge overview must report at least one Forge promotion record");
    }
    if (registryEntryCount < 1) {
      issues.push("standalone Forge overview must report at least one Forge registry entry");
    }
    if (recentEntries.length < 7) {
      issues.push("standalone Forge overview must return the written follow-up, record, proof, transformation proof, transformation record, promotion, and registry entries");
    }
  }

  const ok = issues.length === 0;
  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        standaloneHostRoot,
        metrics: {
          requiredAssets: requiredPaths.length,
          missingAssets: missingPaths.length,
          failedChecks: issues.length,
        },
        issues,
      },
      null,
      2,
    )}\n`,
  );

  if (!ok) {
    process.exit(1);
  }
}

main();
