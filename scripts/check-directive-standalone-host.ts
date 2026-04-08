import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const standaloneHostRoot = path.resolve(directiveRoot, "hosts", "standalone-host");
  const runtimePath = path.resolve(standaloneHostRoot, "runtime.ts");
  const bootstrapPath = path.resolve(standaloneHostRoot, "bootstrap.ts");
  const configPath = path.resolve(standaloneHostRoot, "config.ts");
  const forgePath = path.resolve(standaloneHostRoot, "forge.ts");
  const indexPath = path.resolve(standaloneHostRoot, "index.ts");
  const cliPath = path.resolve(standaloneHostRoot, "cli.ts");
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
  const exampleConfigPath = path.resolve(
    standaloneHostRoot,
    "standalone-host.config.example.json",
  );
  const readmePath = path.resolve(standaloneHostRoot, "README.md");
  const queueOnlyExamplePath = path.resolve(
    directiveRoot,
    "hosts",
    "integration-kit",
    "examples",
    "discovery-submission-queue-only.json",
  );
  const tsxPath = path.resolve(process.cwd(), "node_modules", ".bin", "tsx.cmd");

  const issues: string[] = [];
  const requiredPaths = [
    runtimePath,
    bootstrapPath,
    configPath,
    forgePath,
    indexPath,
    cliPath,
    forgeFollowUpExamplePath,
    forgeRecordExamplePath,
    forgeProofExamplePath,
    forgeTransformationProofExamplePath,
    forgeTransformationRecordExamplePath,
    forgePromotionExamplePath,
    forgeRegistryExamplePath,
    exampleConfigPath,
    readmePath,
    queueOnlyExamplePath,
    tsxPath,
  ];
  const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));
  if (missingPaths.length > 0) {
    issues.push(...missingPaths.map((filePath) => `missing standalone host asset: ${filePath}`));
  }

  if (issues.length > 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, issues }, null, 2)}\n`);
    process.exit(1);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dw-standalone-host-check-"));
  const runtimeDirectiveRoot = path.resolve(tempRoot, "directive-runtime");
  const acceptanceRoot = path.resolve(tempRoot, "acceptance-output");
  const acceptanceReportPath = path.resolve(
    acceptanceRoot,
    "directive-workspace-artifacts",
    "host-integration-acceptance-report.json",
  );
  let acceptanceReportWritten = false;

  let acceptanceOutput: Record<string, unknown> | null = null;
  let submitOutput: Record<string, unknown> | null = null;
  let engineSubmitOutput: Record<string, unknown> | null = null;
  let overviewOutput: Record<string, unknown> | null = null;
  let engineRecordWritten = false;
  let engineReportWritten = false;
  let engineReportIncludesUsefulnessRationale = false;

  try {
    const engineRequestPath = path.resolve(tempRoot, "discovery-engine-request.json");
    const engineRequest = {
      ...(JSON.parse(fs.readFileSync(queueOnlyExamplePath, "utf8")) as Record<
        string,
        unknown
      >),
      candidate_id: "dw-example-queue-engine",
      candidate_name: "Example Queue-Only Engine Discovery Candidate",
      mission_alignment:
        "Improve discovery routing quality while recording the full Directive Engine run for host consumption.",
    };
    fs.writeFileSync(
      engineRequestPath,
      `${JSON.stringify(engineRequest, null, 2)}\n`,
      "utf8",
    );

    acceptanceOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' acceptance-quickstart --output-root '${acceptanceRoot}'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;
    acceptanceReportWritten = fs.existsSync(acceptanceReportPath);

    submitOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' discovery-submit --directive-root '${runtimeDirectiveRoot}' --input-json-path '${queueOnlyExamplePath}' --received-at '2026-03-23'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    engineSubmitOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' discovery-submit --directive-root '${runtimeDirectiveRoot}' --input-json-path '${engineRequestPath}' --received-at '2026-03-23' --process-with-engine`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;

    const engine = engineSubmitOutput.engine as Record<string, unknown> | undefined;
    const engineRecordPath =
      typeof engine?.path === "string" ? engine.path : null;
    const engineReportPath =
      typeof engine?.reportPath === "string" ? engine.reportPath : null;
    engineRecordWritten = Boolean(engineRecordPath && fs.existsSync(engineRecordPath));
    engineReportWritten = Boolean(engineReportPath && fs.existsSync(engineReportPath));
    engineReportIncludesUsefulnessRationale = Boolean(
      engineReportPath
      && fs.existsSync(engineReportPath)
      && fs.readFileSync(engineReportPath, "utf8").includes("## Usefulness Rationale"),
    );

    overviewOutput = JSON.parse(
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& '${tsxPath}' '${cliPath}' discovery-overview --directive-root '${runtimeDirectiveRoot}' --max-entries 4 --received-at '2026-03-23'`,
        ],
        { encoding: "utf8" },
      ).trim(),
    ) as Record<string, unknown>;
  } catch (error) {
    issues.push(`standalone host CLI invocation failed: ${String((error as Error).message || error)}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  if (!acceptanceOutput || acceptanceOutput.ok !== true) {
    issues.push("standalone host acceptance quickstart failed");
  } else {
    const report = acceptanceOutput.report as Record<string, unknown> | undefined;
    if (!report || report.accepted !== true) {
      issues.push("standalone host acceptance report must be accepted");
    }
    if (!acceptanceReportWritten) {
      issues.push("standalone host acceptance quickstart must write the canonical report artifact");
    }
  }

  if (!submitOutput || submitOutput.ok !== true) {
    issues.push("standalone host discovery-submit failed");
  } else {
    if (submitOutput.status !== "pending") {
      issues.push("standalone host discovery-submit must create a pending entry");
    }
    if (submitOutput.record_shape !== "queue_only") {
      issues.push("standalone host discovery-submit must preserve queue_only shape");
    }
  }

  if (!engineSubmitOutput || engineSubmitOutput.ok !== true) {
    issues.push("standalone host discovery-submit --process-with-engine failed");
  } else {
    const engine = engineSubmitOutput.engine as Record<string, unknown> | undefined;
    const record = engine?.record as Record<string, unknown> | undefined;
    const analysis = record?.analysis as Record<string, unknown> | undefined;
    const reportPlan = record?.reportPlan as Record<string, unknown> | undefined;
    if (engine?.ok !== true || engine?.processed !== true) {
      issues.push("standalone host engine-backed discovery submit must process the source through the Engine");
    }
    if (typeof engine?.path !== "string" || typeof engine?.reportPath !== "string") {
      issues.push("standalone host engine-backed discovery submit must return persisted Engine artifact paths");
    }
    if (!record || typeof record.runId !== "string") {
      issues.push("standalone host engine-backed discovery submit must return the full DirectiveEngineRunRecord");
    }
    if (
      typeof analysis?.usefulnessRationale !== "string"
      || typeof reportPlan?.usefulnessRationale !== "string"
    ) {
      issues.push("standalone host engine-backed discovery submit must preserve Engine usefulness rationale fields");
    }
    if (!engineRecordWritten || !engineReportWritten) {
      issues.push("standalone host engine-backed discovery submit must persist the Engine run record and report artifacts");
    }
    if (!engineReportIncludesUsefulnessRationale) {
      issues.push("standalone host engine run report must include the usefulness rationale section");
    }
  }

  if (!overviewOutput || overviewOutput.ok !== true) {
    issues.push("standalone host discovery-overview failed");
  } else {
    const overview = overviewOutput.overview as Record<string, unknown> | undefined;
    const totalEntries = Number(overview?.totalEntries ?? 0);
    const recentEntries = Array.isArray(overview?.recentEntries)
      ? overview?.recentEntries
      : [];
    if (totalEntries < 1) {
      issues.push("standalone host overview must report at least one queue entry after submission");
    }
    if (recentEntries.length < 1) {
      issues.push("standalone host overview must return at least one recent entry after submission");
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
