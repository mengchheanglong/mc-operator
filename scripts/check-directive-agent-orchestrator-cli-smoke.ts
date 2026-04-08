import fs from "node:fs";
import path from "node:path";
import {
  getForgePromotionProfile,
  resolveDirectiveWorkspacePath,
} from "./directive-promotion-profile-lib";
import {
  getForgeSourcePackCatalogEntry,
  getForgeSourcePackPath,
} from "@/server/paths/directive-source-packs";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

type AoCliSmokeReport = {
  suite?: string;
  ok?: boolean;
  generatedAt?: string;
  sourcePack?: string;
  sourcePackClassification?: string;
  sourcePackActivationMode?: string;
  cliEntryRelativePath?: string;
  statusCommand?: string;
  statusOutputKind?: string;
  statusSessionCount?: number;
  builtPackages?: string[];
  targetProjectPath?: string;
  latestPath?: string;
  archivePath?: string;
  error?: string;
};

function readIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function includesAll(content: string, required: string[]) {
  const missing = required.filter((term) => !content.includes(term));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function main() {
  const workspaceRoot = process.cwd();
  const directiveRoot = path.resolve(workspaceRoot, "..", "directive-workspace");
  const profile = getForgePromotionProfile("ao_cli_runtime_guard/v1");

  const executionPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-agent-orchestrator-cli-runtime-slice-01-execution.md",
  );
  const proofPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-agent-orchestrator-cli-runtime-slice-01-proof.md",
  );
  const contractPath = resolveDirectiveWorkspacePath(profile.contractPath);
  const latestReportPath = path.join(
    workspaceRoot,
    "reports",
    "ao-cli-smoke",
    "agent-orchestrator-latest.json",
  );
  const packRoot = getForgeSourcePackPath("agent-orchestrator");
  const packReadyPath = path.join(packRoot, "SOURCE_PACK_READY.md");
  const sourcePackEntry = getForgeSourcePackCatalogEntry("agent-orchestrator");
  const promotionPath = path.join(
    directiveRoot,
    "forge",
    "promotion-records",
    "2026-03-21-agent-orchestrator-promotion-record.md",
  );
  const registryPath = path.join(
    directiveRoot,
    "forge",
    "registry",
    "2026-03-21-agent-orchestrator-registry-entry.md",
  );

  const checks: Check[] = [];

  const execution = readIfExists(executionPath);
  const proof = readIfExists(proofPath);
  const contract = readIfExists(contractPath);
  const latestReport = readIfExists(latestReportPath);

  checks.push({
    id: "ao-cli-execution-exists",
    ok: Boolean(execution),
    reason: execution ? null : `missing execution record: ${executionPath}`,
  });
  checks.push({
    id: "ao-cli-proof-exists",
    ok: Boolean(proof),
    reason: proof ? null : `missing proof record: ${proofPath}`,
  });
  checks.push({
    id: "ao-cli-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "ao-cli-smoke-report-exists",
    ok: Boolean(latestReport),
    reason: latestReport ? null : `missing latest smoke report: ${latestReportPath}`,
  });
  checks.push({
    id: "ao-cli-source-pack-ready",
    ok: fs.existsSync(packReadyPath),
    reason: fs.existsSync(packReadyPath) ? null : `missing ready marker: ${packReadyPath}`,
  });
  checks.push({
    id: "ao-cli-source-pack-follow-up-only",
    ok:
      sourcePackEntry?.classification === "follow_up_only" &&
      sourcePackEntry.activationMode === "manual_follow_up",
    reason:
      sourcePackEntry?.classification === "follow_up_only" &&
      sourcePackEntry.activationMode === "manual_follow_up"
        ? null
        : `unexpected source-pack classification: ${JSON.stringify(sourcePackEntry)}`,
  });
  checks.push({
    id: "ao-cli-no-promotion-record",
    ok: !fs.existsSync(promotionPath),
    reason: fs.existsSync(promotionPath) ? `unexpected promotion record: ${promotionPath}` : null,
  });
  checks.push({
    id: "ao-cli-no-registry-entry",
    ok: !fs.existsSync(registryPath),
    reason: fs.existsSync(registryPath) ? `unexpected registry entry: ${registryPath}` : null,
  });

  if (contract) {
    const required = includesAll(contract, [
      profile.id,
      profile.family,
      profile.proofShape,
      profile.primaryHostCheckCommand,
      "ao status --json",
      "`classification = follow_up_only`",
      "`activationMode = manual_follow_up`",
      "no promotion or registry artifacts",
    ]);
    checks.push({
      id: "ao-cli-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (execution) {
    const required = includesAll(execution, [
      "bounded AO CLI status smoke",
      "ao status --json",
      "npm run forge:agent-orchestrator:smoke",
      "npm run check:directive-agent-orchestrator-cli-smoke",
      "npm run check:directive-agent-orchestrator-preconditions",
      "npm run check:ops-stack",
    ]);
    checks.push({
      id: "ao-cli-execution-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing execution terms: ${required.missing.join(", ")}`,
    });
  }

  if (proof) {
    const required = includesAll(proof, [
      `Quality gate profile: \`${profile.id}\``,
      `Promotion profile family: \`${profile.family}\``,
      `Proof shape: \`${profile.proofShape}\``,
      `Primary host checker: \`${profile.primaryHostCheckCommand}\``,
      "Status command: `ao status --json`",
      "Status output kind: `json-array`",
      "Status session count: `0`",
      "`npm run forge:agent-orchestrator:smoke` -> PASS",
      "`npm run check:directive-agent-orchestrator-cli-smoke` -> PASS",
      "`npm run check:directive-agent-orchestrator-preconditions` -> PASS",
      "`npm run check:ops-stack` -> PASS",
    ]);
    checks.push({
      id: "ao-cli-proof-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing proof terms: ${required.missing.join(", ")}`,
    });
  }

  if (latestReport) {
    const parsed = JSON.parse(latestReport) as AoCliSmokeReport;
    const builtPackages = Array.isArray(parsed.builtPackages) ? parsed.builtPackages : [];
    const archivePathOk =
      typeof parsed.archivePath === "string" &&
      parsed.archivePath.length > 0 &&
      fs.existsSync(parsed.archivePath);
    const requiredBuiltPackages = [
      "@composio/ao-core",
      "@composio/ao-plugin-agent-claude-code",
      "@composio/ao-plugin-agent-codex",
      "@composio/ao-plugin-agent-aider",
      "@composio/ao-plugin-agent-opencode",
      "@composio/ao-plugin-scm-github",
      "@composio/ao-cli",
    ];

    checks.push({
      id: "ao-cli-smoke-thresholds",
      ok:
        parsed.suite === "agent-orchestrator-cli-smoke" &&
        parsed.ok === true &&
        parsed.sourcePack === "agent-orchestrator" &&
        parsed.sourcePackClassification === "follow_up_only" &&
        parsed.sourcePackActivationMode === "manual_follow_up" &&
        parsed.cliEntryRelativePath === "packages/cli/dist/index.js" &&
        parsed.statusCommand === "ao status --json" &&
        parsed.statusOutputKind === "json-array" &&
        Number(parsed.statusSessionCount ?? -1) === 0 &&
        requiredBuiltPackages.every((pkg) => builtPackages.includes(pkg)) &&
        parsed.targetProjectPath === path.join(path.resolve(workspaceRoot, ".."), "mission-control") &&
        archivePathOk,
      reason:
        parsed.suite === "agent-orchestrator-cli-smoke" &&
        parsed.ok === true &&
        parsed.sourcePack === "agent-orchestrator" &&
        parsed.sourcePackClassification === "follow_up_only" &&
        parsed.sourcePackActivationMode === "manual_follow_up" &&
        parsed.cliEntryRelativePath === "packages/cli/dist/index.js" &&
        parsed.statusCommand === "ao status --json" &&
        parsed.statusOutputKind === "json-array" &&
        Number(parsed.statusSessionCount ?? -1) === 0 &&
        requiredBuiltPackages.every((pkg) => builtPackages.includes(pkg)) &&
        parsed.targetProjectPath === path.join(path.resolve(workspaceRoot, ".."), "mission-control") &&
        archivePathOk
          ? null
          : `latest smoke invalid: ok=${parsed.ok} sourcePack=${parsed.sourcePack} classification=${parsed.sourcePackClassification} activation=${parsed.sourcePackActivationMode} cliEntry=${parsed.cliEntryRelativePath} statusCommand=${parsed.statusCommand} outputKind=${parsed.statusOutputKind} sessionCount=${parsed.statusSessionCount} target=${parsed.targetProjectPath} archivePathOk=${archivePathOk} error=${parsed.error || "none"}`,
    });
  }

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failed.length > 0) process.exit(1);
}

main();
