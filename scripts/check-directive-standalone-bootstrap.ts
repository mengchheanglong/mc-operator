import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const standaloneHostRoot = path.resolve(directiveRoot, "hosts", "standalone-host");
  const bootstrapPath = path.resolve(standaloneHostRoot, "bootstrap.ts");
  const cliPath = path.resolve(standaloneHostRoot, "cli.ts");
  const tsxPath = path.resolve(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  const requiredPaths = [bootstrapPath, cliPath, tsxPath];
  const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));
  if (missingPaths.length > 0) {
    issues.push(
      ...missingPaths.map((filePath) =>
        `missing standalone bootstrap asset: ${filePath}`),
    );
  }

  if (issues.length > 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, issues }, null, 2)}\n`);
    process.exit(1);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dw-standalone-bootstrap-"));
  const bootstrapOutputRoot = path.resolve(tempRoot, "bootstrap-output");
  const generatedConfigPath = path.resolve(
    bootstrapOutputRoot,
    "standalone-host.config.json",
  );
  const generatedReadmePath = path.resolve(bootstrapOutputRoot, "README.md");
  const generatedExampleSubmissionPath = path.resolve(
    bootstrapOutputRoot,
    "discovery-submission.queue-only.example.json",
  );
  const generatedForgeFollowUpPath = path.resolve(
    bootstrapOutputRoot,
    "forge-follow-up.example.json",
  );
  const generatedForgeRecordPath = path.resolve(
    bootstrapOutputRoot,
    "forge-record.example.json",
  );
  const generatedForgeProofPath = path.resolve(
    bootstrapOutputRoot,
    "forge-proof-bundle.example.json",
  );
  const generatedTransformationProofPath = path.resolve(
    bootstrapOutputRoot,
    "forge-transformation-proof.example.json",
  );
  const generatedTransformationRecordPath = path.resolve(
    bootstrapOutputRoot,
    "forge-transformation-record.example.json",
  );
  const generatedForgePromotionPath = path.resolve(
    bootstrapOutputRoot,
    "forge-promotion-record.example.json",
  );
  const generatedForgeRegistryPath = path.resolve(
    bootstrapOutputRoot,
    "forge-registry-entry.example.json",
  );
  const generatedQueuePath = path.resolve(
    bootstrapOutputRoot,
    "directive-root",
    "discovery",
    "intake-queue.json",
  );
  const generatedForgeFollowUpDirectory = path.resolve(
    bootstrapOutputRoot,
    "directive-root",
    "forge",
    "follow-up",
  );
  const generatedForgeRecordsDirectory = path.resolve(
    bootstrapOutputRoot,
    "directive-root",
    "forge",
    "records",
  );
  const generatedForgePromotionRecordsDirectory = path.resolve(
    bootstrapOutputRoot,
    "directive-root",
    "forge",
    "promotion-records",
  );
  const generatedForgeRegistryDirectory = path.resolve(
    bootstrapOutputRoot,
    "directive-root",
    "forge",
    "registry",
  );
  const generatedRuntimeArtifactsRoot = path.resolve(
    bootstrapOutputRoot,
    "directive-root",
    "runtime",
    "standalone-host",
  );

  let initOutput: Record<string, unknown> | null = null;
  let submitOutput: Record<string, unknown> | null = null;
  let overviewOutput: Record<string, unknown> | null = null;
  let forgeFollowUpOutput: Record<string, unknown> | null = null;
  let forgeRecordOutput: Record<string, unknown> | null = null;
  let forgeProofOutput: Record<string, unknown> | null = null;
  let forgeTransformationProofOutput: Record<string, unknown> | null = null;
  let forgeTransformationRecordOutput: Record<string, unknown> | null = null;
  let forgePromotionOutput: Record<string, unknown> | null = null;
  let forgeRegistryOutput: Record<string, unknown> | null = null;
  let forgeOverviewOutput: Record<string, unknown> | null = null;

  try {
    initOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' init --output-root '${bootstrapOutputRoot}' --received-at '2026-03-23' --persistence-mode filesystem_and_sqlite`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    submitOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' discovery-submit --config '${generatedConfigPath}' --input-json-path '${generatedExampleSubmissionPath}'`,
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
          `& '${tsxPath}' '${cliPath}' discovery-overview --config '${generatedConfigPath}' --max-entries 4`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    forgeFollowUpOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-followup-write --config '${generatedConfigPath}' --input-json-path '${generatedForgeFollowUpPath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    forgeRecordOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-record-write --config '${generatedConfigPath}' --input-json-path '${generatedForgeRecordPath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    forgeProofOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-proof-write --config '${generatedConfigPath}' --input-json-path '${generatedForgeProofPath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    forgeTransformationProofOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-transformation-proof-write --config '${generatedConfigPath}' --input-json-path '${generatedTransformationProofPath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    forgeTransformationRecordOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-transformation-record-write --config '${generatedConfigPath}' --input-json-path '${generatedTransformationRecordPath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    forgePromotionOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-promotion-write --config '${generatedConfigPath}' --input-json-path '${generatedForgePromotionPath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    forgeRegistryOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-registry-write --config '${generatedConfigPath}' --input-json-path '${generatedForgeRegistryPath}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    forgeOverviewOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' forge-overview --config '${generatedConfigPath}' --max-entries 7`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;
  } catch (error) {
    issues.push(
      `standalone bootstrap CLI invocation failed: ${String((error as Error).message || error)}`,
    );
  }

  if (!initOutput || initOutput.ok !== true) {
    issues.push("standalone bootstrap init command failed");
  } else {
    if (!fs.existsSync(generatedConfigPath)) {
      issues.push("standalone bootstrap must write the default config file");
    }
    if (!fs.existsSync(generatedReadmePath)) {
      issues.push("standalone bootstrap must write a local quickstart README");
    }
    if (!fs.existsSync(generatedExampleSubmissionPath)) {
      issues.push("standalone bootstrap must write the example Discovery submission");
    }
    if (!fs.existsSync(generatedForgeFollowUpPath)) {
      issues.push("standalone bootstrap must write the example Forge follow-up payload");
    }
    if (!fs.existsSync(generatedForgeRecordPath)) {
      issues.push("standalone bootstrap must write the example Forge record payload");
    }
    if (!fs.existsSync(generatedForgeProofPath)) {
      issues.push("standalone bootstrap must write the example Forge proof payload");
    }
    if (!fs.existsSync(generatedTransformationProofPath)) {
      issues.push("standalone bootstrap must write the example Forge transformation proof payload");
    }
    if (!fs.existsSync(generatedTransformationRecordPath)) {
      issues.push("standalone bootstrap must write the example Forge transformation record payload");
    }
    if (!fs.existsSync(generatedForgePromotionPath)) {
      issues.push("standalone bootstrap must write the example Forge promotion payload");
    }
    if (!fs.existsSync(generatedForgeRegistryPath)) {
      issues.push("standalone bootstrap must write the example Forge registry payload");
    }
    if (!fs.existsSync(generatedQueuePath)) {
      issues.push("standalone bootstrap must create the canonical Discovery intake queue");
    }
    if (!fs.existsSync(generatedForgeFollowUpDirectory)) {
      issues.push("standalone bootstrap must pre-create the canonical Forge follow-up directory");
    }
    if (!fs.existsSync(generatedForgeRecordsDirectory)) {
      issues.push("standalone bootstrap must pre-create the canonical Forge records directory");
    }
    if (!fs.existsSync(generatedForgePromotionRecordsDirectory)) {
      issues.push("standalone bootstrap must pre-create the canonical Forge promotion-records directory");
    }
    if (!fs.existsSync(generatedForgeRegistryDirectory)) {
      issues.push("standalone bootstrap must pre-create the canonical Forge registry directory");
    }
    if (!fs.existsSync(generatedRuntimeArtifactsRoot)) {
      issues.push("standalone bootstrap must pre-create the canonical runtime artifacts directory");
    }
  }

  if (!submitOutput || submitOutput.ok !== true) {
    issues.push("standalone bootstrap discovery-submit flow failed");
  } else if (
    submitOutput.status !== "pending"
    || submitOutput.record_shape !== "queue_only"
  ) {
    issues.push("standalone bootstrap discovery-submit must preserve queue_only pending submissions");
  }

  if (!overviewOutput || overviewOutput.ok !== true) {
    issues.push("standalone bootstrap discovery-overview flow failed");
  } else {
    const overview = overviewOutput.overview as Record<string, unknown> | undefined;
    if (Number(overview?.totalEntries ?? 0) < 1) {
      issues.push("standalone bootstrap overview must report the bootstrapped submission");
    }
  }

  if (!forgeFollowUpOutput || forgeFollowUpOutput.ok !== true) {
    issues.push("standalone bootstrap forge-followup-write flow failed");
  }
  if (!forgeRecordOutput || forgeRecordOutput.ok !== true) {
    issues.push("standalone bootstrap forge-record-write flow failed");
  }
  if (!forgeProofOutput || forgeProofOutput.ok !== true) {
    issues.push("standalone bootstrap forge-proof-write flow failed");
  }
  if (!forgeTransformationProofOutput || forgeTransformationProofOutput.ok !== true) {
    issues.push("standalone bootstrap forge-transformation-proof-write flow failed");
  }
  if (!forgeTransformationRecordOutput || forgeTransformationRecordOutput.ok !== true) {
    issues.push("standalone bootstrap forge-transformation-record-write flow failed");
  }
  if (!forgePromotionOutput || forgePromotionOutput.ok !== true) {
    issues.push("standalone bootstrap forge-promotion-write flow failed");
  }
  if (!forgeRegistryOutput || forgeRegistryOutput.ok !== true) {
    issues.push("standalone bootstrap forge-registry-write flow failed");
  }

  if (!forgeOverviewOutput || forgeOverviewOutput.ok !== true) {
    issues.push("standalone bootstrap forge-overview flow failed");
  } else {
    const overview = forgeOverviewOutput.overview as Record<string, unknown> | undefined;
    if (Number(overview?.followUpCount ?? 0) < 1) {
      issues.push("standalone bootstrap Forge overview must report the bootstrapped follow-up");
    }
    if (Number(overview?.recordCount ?? 0) < 1) {
      issues.push("standalone bootstrap Forge overview must report the bootstrapped record");
    }
    if (Number(overview?.proofBundleCount ?? 0) < 1) {
      issues.push("standalone bootstrap Forge overview must report the bootstrapped proof bundle");
    }
    if (Number(overview?.transformationProofCount ?? 0) < 1) {
      issues.push("standalone bootstrap Forge overview must report the bootstrapped transformation proof");
    }
    if (Number(overview?.transformationRecordCount ?? 0) < 1) {
      issues.push("standalone bootstrap Forge overview must report the bootstrapped transformation record");
    }
    if (Number(overview?.promotionRecordCount ?? 0) < 1) {
      issues.push("standalone bootstrap Forge overview must report the bootstrapped promotion record");
    }
    if (Number(overview?.registryEntryCount ?? 0) < 1) {
      issues.push("standalone bootstrap Forge overview must report the bootstrapped registry entry");
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
    fs.rmSync(tempRoot, { recursive: true, force: true });
    process.exit(1);
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
}

main();
