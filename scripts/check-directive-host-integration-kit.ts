import fs from "node:fs";
import path from "node:path";

const directiveWorkspaceRoot = path.resolve(process.cwd(), "..", "directive-workspace");
const integrationKitRoot = path.resolve(
  directiveWorkspaceRoot,
  "hosts",
  "integration-kit",
);

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function main() {
  const readmePath = path.resolve(integrationKitRoot, "README.md");
  const packageManifestPath = path.resolve(integrationKitRoot, "package.json");
  const packageIndexPath = path.resolve(integrationKitRoot, "index.ts");
  const acceptanceContractPath = path.resolve(
    directiveWorkspaceRoot,
    "shared",
    "contracts",
    "host-integration-acceptance.md",
  );
  const acceptanceSchemaPath = path.resolve(
    directiveWorkspaceRoot,
    "shared",
    "schemas",
    "host-integration-acceptance-report.schema.json",
  );
  const examplesRoot = path.resolve(integrationKitRoot, "examples");
  const starterRoot = path.resolve(integrationKitRoot, "starter");
  const cliRoot = path.resolve(integrationKitRoot, "cli");
  const starterIndexPath = path.resolve(starterRoot, "index.ts");
  const cliPath = path.resolve(cliRoot, "host-integration-kit-cli.ts");
  const queueOnlyPath = path.resolve(examplesRoot, "discovery-submission-queue-only.json");
  const fastPathPath = path.resolve(examplesRoot, "discovery-submission-fast-path.json");
  const splitCasePath = path.resolve(examplesRoot, "discovery-submission-split-case.json");
  const runtimeSignalPath = path.resolve(
    examplesRoot,
    "openclaw-runtime-verification-signal.json",
  );
  const maintenanceSignalPath = path.resolve(
    examplesRoot,
    "openclaw-maintenance-watchdog-signal.json",
  );
  const acceptanceExamplePath = path.resolve(
    examplesRoot,
    "host-integration-acceptance-report.json",
  );
  const starterReadmePath = path.resolve(starterRoot, "README.md");
  const starterTemplatePath = path.resolve(
    starterRoot,
    "discovery-submission-adapter.template.ts",
  );
  const starterMemoryBridgePath = path.resolve(
    starterRoot,
    "discovery-host-storage-bridge.memory.template.ts",
  );
  const starterFilesystemBridgePath = path.resolve(
    starterRoot,
    "discovery-host-storage-bridge.filesystem.template.ts",
  );
  const starterSmokeTemplatePath = path.resolve(
    starterRoot,
    "discovery-submission-adapter.smoke.template.ts",
  );
  const starterOverviewReaderPath = path.resolve(
    starterRoot,
    "discovery-overview-reader.template.ts",
  );
  const starterOverviewSmokePath = path.resolve(
    starterRoot,
    "discovery-overview-reader.smoke.template.ts",
  );
  const starterSignalAdapterPath = path.resolve(
    starterRoot,
    "discovery-signal-adapter.template.ts",
  );
  const starterSignalSmokePath = path.resolve(
    starterRoot,
    "discovery-signal-adapter.smoke.template.ts",
  );
  const starterAcceptancePath = path.resolve(
    starterRoot,
    "host-integration-acceptance.template.ts",
  );
  const starterAcceptanceWriterPath = path.resolve(
    starterRoot,
    "write-host-integration-acceptance-report.template.ts",
  );
  const starterAcceptanceQuickstartPath = path.resolve(
    starterRoot,
    "run-host-integration-acceptance-quickstart.template.ts",
  );

  const requiredPaths = [
    readmePath,
    packageManifestPath,
    packageIndexPath,
    cliPath,
    acceptanceContractPath,
    acceptanceSchemaPath,
    queueOnlyPath,
    fastPathPath,
    splitCasePath,
    runtimeSignalPath,
    maintenanceSignalPath,
    acceptanceExamplePath,
    starterReadmePath,
    starterIndexPath,
    starterTemplatePath,
    starterMemoryBridgePath,
    starterFilesystemBridgePath,
    starterSmokeTemplatePath,
    starterOverviewReaderPath,
    starterOverviewSmokePath,
    starterSignalAdapterPath,
    starterSignalSmokePath,
    starterAcceptancePath,
    starterAcceptanceWriterPath,
    starterAcceptanceQuickstartPath,
  ];

  const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));
  const issues: string[] = [];
  if (missingPaths.length > 0) {
    issues.push(...missingPaths.map((filePath) => `missing integration-kit asset: ${filePath}`));
  }

  if (issues.length === 0) {
    const readme = fs.readFileSync(readmePath, "utf8");
    if (!readme.includes("Directive Workspace is the standalone product.")) {
      issues.push("integration kit README must state standalone product ownership");
    }
    if (!readme.includes("Mission Control remains the reference host today")) {
      issues.push("integration kit README must distinguish reference host from product definition");
    }
    if (!readme.includes("starter adapter template")) {
      issues.push("integration kit README must reference the starter adapter template");
    }
    if (!readme.includes("package-ready module surface")) {
      issues.push("integration kit README must reference the package-ready module surface");
    }
    if (!readme.includes("package-ready CLI example")) {
      issues.push("integration kit README must reference the package-ready CLI example");
    }
    if (!readme.includes("memory bridge template")) {
      issues.push("integration kit README must reference the memory bridge template");
    }
    if (!readme.includes("filesystem starter bridges")) {
      issues.push("integration kit README must reference the filesystem starter bridge");
    }
    if (!readme.includes("smoke template")) {
      issues.push("integration kit README must reference the smoke template");
    }
    if (!readme.includes("overview reader starter")) {
      issues.push("integration kit README must reference the overview reader starter");
    }
    if (!readme.includes("signal adapter starter")) {
      issues.push("integration kit README must reference the signal adapter starter");
    }
    if (!readme.includes("Acceptance standard")) {
      issues.push("integration kit README must define the acceptance standard section");
    }
    if (!readme.includes("acceptance report writer starter")) {
      issues.push("integration kit README must reference the acceptance report writer starter");
    }
    if (!readme.includes("acceptance quickstart runner starter")) {
      issues.push("integration kit README must reference the acceptance quickstart runner starter");
    }

    const queueOnly = readJson(queueOnlyPath);
    if (queueOnly.record_shape !== "queue_only") {
      issues.push("queue-only example must use record_shape=queue_only");
    }

    const fastPath = readJson(fastPathPath);
    if (fastPath.record_shape !== "fast_path") {
      issues.push("fast-path example must use record_shape=fast_path");
    }
    if (
      typeof fastPath.fast_path !== "object" ||
      fastPath.fast_path === null ||
      !("next_artifact" in fastPath.fast_path)
    ) {
      issues.push("fast-path example must include fast_path.next_artifact");
    }

    const splitCase = readJson(splitCasePath);
    if (splitCase.record_shape !== "split_case") {
      issues.push("split-case example must use record_shape=split_case");
    }
    if (
      typeof splitCase.case_record !== "object" ||
      splitCase.case_record === null ||
      !("intake" in splitCase.case_record) ||
      !("triage" in splitCase.case_record) ||
      !("routing" in splitCase.case_record)
    ) {
      issues.push("split-case example must include intake/triage/routing sections");
    }

    const runtimeSignal = readJson(runtimeSignalPath);
    if (runtimeSignal.signal_detected !== true) {
      issues.push("runtime verification example must set signal_detected=true");
    }
    if (!Array.isArray(runtimeSignal.reasons)) {
      issues.push("runtime verification example must include reasons array");
    }

    const maintenanceSignal = readJson(maintenanceSignalPath);
    if (maintenanceSignal.candidate_name !== "OpenClaw Maintenance Watchdog Signal") {
      issues.push("maintenance watchdog example must use canonical candidate_name");
    }
    if (maintenanceSignal.capability_gap_id !== null) {
      issues.push("maintenance watchdog example must leave capability_gap_id null when no active unresolved gap is claimed");
    }

    const acceptanceExample = readJson(acceptanceExamplePath);
    if (acceptanceExample.accepted !== true) {
      issues.push("acceptance report example must represent a successful host integration");
    }
    if (acceptanceExample.module_surface !== "package_import") {
      issues.push("acceptance report example must demonstrate the package_import module surface");
    }
    if (
      typeof acceptanceExample.submission_acceptance !== "object" ||
      acceptanceExample.submission_acceptance === null ||
      acceptanceExample.submission_acceptance.ok !== true
    ) {
      issues.push("acceptance report example must include a passing submission_acceptance section");
    }
    if (
      typeof acceptanceExample.overview_acceptance !== "object" ||
      acceptanceExample.overview_acceptance === null ||
      acceptanceExample.overview_acceptance.ok !== true
    ) {
      issues.push("acceptance report example must include a passing overview_acceptance section");
    }
    if (
      typeof acceptanceExample.signal_acceptance !== "object" ||
      acceptanceExample.signal_acceptance === null ||
      acceptanceExample.signal_acceptance.ok !== true
    ) {
      issues.push("acceptance report example must include a passing signal_acceptance section");
    }
    if (!Array.isArray(acceptanceExample.notes) || acceptanceExample.notes.length < 1) {
      issues.push("acceptance report example must include explanatory notes");
    }

    const starterReadme = fs.readFileSync(starterReadmePath, "utf8");
    if (!starterReadme.includes("copy the template into your host repo")) {
      issues.push("starter README must explain how to copy the template into a host repo");
    }
    if (!starterReadme.includes("memory bridge")) {
      issues.push("starter README must explain the memory bridge bootstrap step");
    }
    if (!starterReadme.includes("smoke template")) {
      issues.push("starter README must explain the smoke template bootstrap step");
    }
    if (!starterReadme.includes("Discovery overview")) {
      issues.push("starter README must explain the Discovery overview starter");
    }
    if (!starterReadme.includes("signal starter")) {
      issues.push("starter README must explain the signal starter");
    }
    if (!starterReadme.includes("package-ready integration-kit")) {
      issues.push("starter README must explain the package-ready integration-kit import path");
    }

    const packageManifest = readJson(packageManifestPath);
    if (packageManifest.name !== "@directive-workspace/host-integration-kit") {
      issues.push("integration kit package manifest must use the canonical package name");
    }
    if (packageManifest.type !== "module") {
      issues.push("integration kit package manifest must use module type");
    }
    if (
      typeof packageManifest.exports !== "object" ||
      packageManifest.exports === null ||
      packageManifest.exports["."] !== "./index.ts" ||
      packageManifest.exports["./cli"] !== "./cli/host-integration-kit-cli.ts" ||
      packageManifest.exports["./starter"] !== "./starter/index.ts" ||
      packageManifest.exports["./starter/filesystem-bridge"] !==
        "./starter/discovery-host-storage-bridge.filesystem.template.ts" ||
      packageManifest.exports["./starter/acceptance"] !==
        "./starter/host-integration-acceptance.template.ts"
      || packageManifest.exports["./starter/acceptance-writer"] !==
        "./starter/write-host-integration-acceptance-report.template.ts"
      || packageManifest.exports["./starter/acceptance-quickstart"] !==
        "./starter/run-host-integration-acceptance-quickstart.template.ts"
    ) {
      issues.push("integration kit package manifest must export the root, cli, starter, filesystem-bridge, acceptance, acceptance-writer, and acceptance-quickstart entrypoints");
    }

    const acceptanceContract = fs.readFileSync(acceptanceContractPath, "utf8");
    if (!acceptanceContract.includes("Submission path works")) {
      issues.push("host integration acceptance contract must require the submission path");
    }
    if (!acceptanceContract.includes("Overview path works")) {
      issues.push("host integration acceptance contract must require the overview path");
    }
    if (!acceptanceContract.includes("Signal path works")) {
      issues.push("host integration acceptance contract must require the signal path");
    }

    const acceptanceSchema = readJson(acceptanceSchemaPath);
    if (acceptanceSchema.title !== "HostIntegrationAcceptanceReport") {
      issues.push("host integration acceptance schema must use the canonical title");
    }
    if (
      !Array.isArray(acceptanceSchema.required) ||
      !acceptanceSchema.required.includes("submission_acceptance") ||
      !acceptanceSchema.required.includes("overview_acceptance") ||
      !acceptanceSchema.required.includes("signal_acceptance")
    ) {
      issues.push("host integration acceptance schema must require submission/overview/signal sections");
    }

    const packageIndex = fs.readFileSync(packageIndexPath, "utf8");
    if (!packageIndex.includes('export * from "./starter/index"')) {
      issues.push("integration kit package index must re-export the starter surface");
    }

    const cliSource = fs.readFileSync(cliPath, "utf8");
    if (!cliSource.includes("acceptance-quickstart")) {
      issues.push("integration kit CLI example must support acceptance-quickstart");
    }
    if (!cliSource.includes("submission-memory-dry-run")) {
      issues.push("integration kit CLI example must support submission-memory-dry-run");
    }
    if (!cliSource.includes("print-submission-example")) {
      issues.push("integration kit CLI example must support print-submission-example");
    }
    if (!cliSource.includes("runHostIntegrationAcceptanceQuickstart")) {
      issues.push("integration kit CLI example must reuse the acceptance quickstart");
    }
    if (!cliSource.includes("submitDiscoveryEntryWithHostBridge")) {
      issues.push("integration kit CLI example must reuse the canonical submission bridge");
    }

    const starterIndex = fs.readFileSync(starterIndexPath, "utf8");
    if (!starterIndex.includes("discovery-submission-adapter.template")) {
      issues.push("starter index must re-export the submission adapter starter");
    }
    if (!starterIndex.includes("discovery-overview-reader.template")) {
      issues.push("starter index must re-export the overview reader starter");
    }
    if (!starterIndex.includes("discovery-signal-adapter.template")) {
      issues.push("starter index must re-export the signal adapter starter");
    }
    if (!starterIndex.includes("host-integration-acceptance.template")) {
      issues.push("starter index must re-export the host integration acceptance starter");
    }
    if (!starterIndex.includes("write-host-integration-acceptance-report.template")) {
      issues.push("starter index must re-export the host integration acceptance writer starter");
    }
    if (!starterIndex.includes("run-host-integration-acceptance-quickstart.template")) {
      issues.push("starter index must re-export the host integration acceptance quickstart starter");
    }

    const starterTemplate = fs.readFileSync(starterTemplatePath, "utf8");
    if (!starterTemplate.includes("submitDiscoveryEntryWithHostBridge")) {
      issues.push("starter adapter template must export submitDiscoveryEntryWithHostBridge");
    }
    if (!starterTemplate.includes("DiscoveryHostStorageBridge")) {
      issues.push("starter adapter template must define DiscoveryHostStorageBridge");
    }
    if (!starterTemplate.includes("determineDiscoverySubmissionShape")) {
      issues.push("starter adapter template must compose canonical shared libs");
    }

    const starterMemoryBridge = fs.readFileSync(starterMemoryBridgePath, "utf8");
    if (!starterMemoryBridge.includes("createMemoryDiscoveryHostStorageBridge")) {
      issues.push("starter memory bridge must export createMemoryDiscoveryHostStorageBridge");
    }
    if (!starterMemoryBridge.includes("DiscoveryHostStorageBridge")) {
      issues.push("starter memory bridge must stay aligned with the host bridge type");
    }
    if (!starterMemoryBridge.includes('status: "primary"')) {
      issues.push("starter memory bridge must seed the canonical primary queue status");
    }

    const starterFilesystemBridge = fs.readFileSync(starterFilesystemBridgePath, "utf8");
    if (!starterFilesystemBridge.includes("createFilesystemDiscoveryHostStorageBridge")) {
      issues.push("starter filesystem bridge must export createFilesystemDiscoveryHostStorageBridge");
    }
    if (!starterFilesystemBridge.includes("DiscoveryHostStorageBridge")) {
      issues.push("starter filesystem bridge must stay aligned with the host bridge type");
    }
    if (!starterFilesystemBridge.includes('status: "primary"')) {
      issues.push("starter filesystem bridge must seed the canonical primary queue status");
    }

    const starterSmokeTemplate = fs.readFileSync(starterSmokeTemplatePath, "utf8");
    if (!starterSmokeTemplate.includes("runDiscoveryStarterSmoke")) {
      issues.push("starter smoke template must export runDiscoveryStarterSmoke");
    }
    if (!starterSmokeTemplate.includes("createFilesystemDiscoveryHostStorageBridge")) {
      issues.push("starter smoke template must use the filesystem bridge template");
    }
    if (!starterSmokeTemplate.includes("submitDiscoveryEntryWithHostBridge")) {
      issues.push("starter smoke template must exercise the canonical host adapter path");
    }

    const starterOverviewReader = fs.readFileSync(starterOverviewReaderPath, "utf8");
    if (!starterOverviewReader.includes("readDiscoveryOverviewWithHostBridge")) {
      issues.push("starter overview reader must export readDiscoveryOverviewWithHostBridge");
    }
    if (!starterOverviewReader.includes("DiscoveryOverviewHostStorageBridge")) {
      issues.push("starter overview reader must define a host storage bridge");
    }
    if (!starterOverviewReader.includes("DiscoveryIntakeQueueDocument")) {
      issues.push("starter overview reader must consume the canonical queue document type");
    }

    const starterOverviewSmoke = fs.readFileSync(starterOverviewSmokePath, "utf8");
    if (!starterOverviewSmoke.includes("runDiscoveryOverviewStarterSmoke")) {
      issues.push("starter overview smoke must export runDiscoveryOverviewStarterSmoke");
    }
    if (!starterOverviewSmoke.includes("createMemoryDiscoveryHostStorageBridge")) {
      issues.push("starter overview smoke must use the memory bridge starter");
    }
    if (!starterOverviewSmoke.includes("readDiscoveryOverviewWithHostBridge")) {
      issues.push("starter overview smoke must exercise the overview reader starter");
    }

    const starterSignalAdapter = fs.readFileSync(starterSignalAdapterPath, "utf8");
    if (!starterSignalAdapter.includes("submitRuntimeVerificationSignalWithHostBridge")) {
      issues.push("starter signal adapter must export runtime verification submission helper");
    }
    if (!starterSignalAdapter.includes("submitMaintenanceWatchdogSignalWithHostBridge")) {
      issues.push("starter signal adapter must export maintenance watchdog submission helper");
    }
    if (!starterSignalAdapter.includes("submitDiscoveryEntryWithHostBridge")) {
      issues.push("starter signal adapter must reuse the canonical submission bridge");
    }

    const starterSignalSmoke = fs.readFileSync(starterSignalSmokePath, "utf8");
    if (!starterSignalSmoke.includes("runDiscoverySignalStarterSmoke")) {
      issues.push("starter signal smoke must export runDiscoverySignalStarterSmoke");
    }
    if (!starterSignalSmoke.includes("createMemoryDiscoveryHostStorageBridge")) {
      issues.push("starter signal smoke must use the memory bridge starter");
    }
    if (!starterSignalSmoke.includes("submitRuntimeVerificationSignalWithHostBridge")) {
      issues.push("starter signal smoke must exercise the runtime verification signal helper");
    }
    if (!starterSignalSmoke.includes("submitMaintenanceWatchdogSignalWithHostBridge")) {
      issues.push("starter signal smoke must exercise the maintenance watchdog signal helper");
    }

    const starterAcceptance = fs.readFileSync(starterAcceptancePath, "utf8");
    if (!starterAcceptance.includes("runHostIntegrationAcceptance")) {
      issues.push("starter acceptance harness must export runHostIntegrationAcceptance");
    }
    if (!starterAcceptance.includes("runDiscoveryStarterSmoke")) {
      issues.push("starter acceptance harness must compose the submission smoke");
    }
    if (!starterAcceptance.includes("runDiscoveryOverviewStarterSmoke")) {
      issues.push("starter acceptance harness must compose the overview smoke");
    }
    if (!starterAcceptance.includes("runDiscoverySignalStarterSmoke")) {
      issues.push("starter acceptance harness must compose the signal smoke");
    }

    const starterAcceptanceWriter = fs.readFileSync(starterAcceptanceWriterPath, "utf8");
    if (!starterAcceptanceWriter.includes("writeHostIntegrationAcceptanceReport")) {
      issues.push("starter acceptance writer must export writeHostIntegrationAcceptanceReport");
    }
    if (!starterAcceptanceWriter.includes("runHostIntegrationAcceptance")) {
      issues.push("starter acceptance writer must reuse the acceptance harness");
    }
    if (!starterAcceptanceWriter.includes("writeFile")) {
      issues.push("starter acceptance writer must persist the canonical acceptance artifact");
    }

    const starterAcceptanceQuickstart = fs.readFileSync(starterAcceptanceQuickstartPath, "utf8");
    if (!starterAcceptanceQuickstart.includes("runHostIntegrationAcceptanceQuickstart")) {
      issues.push("starter acceptance quickstart must export runHostIntegrationAcceptanceQuickstart");
    }
    if (!starterAcceptanceQuickstart.includes("writeHostIntegrationAcceptanceReport")) {
      issues.push("starter acceptance quickstart must reuse the acceptance writer");
    }
    if (!starterAcceptanceQuickstart.includes("DEFAULT_RELATIVE_OUTPUT_PATH")) {
      issues.push("starter acceptance quickstart must define a stable default relative output path");
    }
  }

  const ok = issues.length === 0;
  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        integrationKitRoot,
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
