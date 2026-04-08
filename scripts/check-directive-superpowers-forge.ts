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

type SuperpowersSmokeReport = {
  suite?: string;
  ok?: boolean;
  generatedAt?: string;
  sourcePack?: string;
  defaultImportSuperpowersCount?: number;
  importedCount?: number;
  updatedCount?: number;
  importedAgent?: {
    name?: string;
    sourcePack?: string;
    sourceRef?: string;
    workflowMode?: string;
    packAssetLabels?: string[];
    packAssetCount?: number;
  };
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
  const profile = getForgePromotionProfile("workflow_operator_import_guard/v1");

  const forgeRecordPath = path.join(directiveRoot, "forge", "records", "2026-03-21-superpowers-forge-record.md");
  const proofPath = path.join(directiveRoot, "forge", "records", "2026-03-21-superpowers-runtime-slice-01-proof.md");
  const promotionPath = path.join(directiveRoot, "forge", "promotion-records", "2026-03-21-superpowers-promotion-record.md");
  const registryPath = path.join(directiveRoot, "forge", "registry", "2026-03-21-superpowers-registry-entry.md");
  const contractPath = resolveDirectiveWorkspacePath(profile.contractPath);
  const latestReportPath = path.join(workspaceRoot, "reports", "agent-pack-imports", "superpowers-latest.json");
  const packRoot = getForgeSourcePackPath("superpowers");
  const packReadyPath = path.join(packRoot, "SOURCE_PACK_READY.md");
  const sourcePackEntry = getForgeSourcePackCatalogEntry("superpowers");
  const importPacksServicePath = path.join(workspaceRoot, "backend", "src", "modules", "agents-import-packs", "agents-import-packs.service.ts");

  const checks: Check[] = [];

  const forgeRecord = readIfExists(forgeRecordPath);
  const proof = readIfExists(proofPath);
  const promotion = readIfExists(promotionPath);
  const registry = readIfExists(registryPath);
  const contract = readIfExists(contractPath);
  const latestReport = readIfExists(latestReportPath);
  const importPacksService = readIfExists(importPacksServicePath);

  checks.push({ id: "superpowers-forge-record-exists", ok: Boolean(forgeRecord), reason: forgeRecord ? null : `missing forge record: ${forgeRecordPath}` });
  checks.push({ id: "superpowers-proof-exists", ok: Boolean(proof), reason: proof ? null : `missing proof: ${proofPath}` });
  checks.push({ id: "superpowers-promotion-exists", ok: Boolean(promotion), reason: promotion ? null : `missing promotion record: ${promotionPath}` });
  checks.push({ id: "superpowers-registry-exists", ok: Boolean(registry), reason: registry ? null : `missing registry entry: ${registryPath}` });
  checks.push({ id: "superpowers-contract-exists", ok: Boolean(contract), reason: contract ? null : `missing contract: ${contractPath}` });
  checks.push({ id: "superpowers-latest-report-exists", ok: Boolean(latestReport), reason: latestReport ? null : `missing latest import smoke report: ${latestReportPath}` });
  checks.push({ id: "superpowers-source-pack-ready", ok: fs.existsSync(packReadyPath), reason: fs.existsSync(packReadyPath) ? null : `missing ready marker: ${packReadyPath}` });
  checks.push({
    id: "superpowers-source-pack-live-runtime",
    ok: sourcePackEntry?.classification === "live_runtime" && sourcePackEntry.activationMode === "agent_pack_import_lane",
    reason: sourcePackEntry?.classification === "live_runtime" && sourcePackEntry.activationMode === "agent_pack_import_lane" ? null : `unexpected source-pack classification: ${JSON.stringify(sourcePackEntry)}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      profile.id,
      profile.family,
      profile.proofShape,
      profile.primaryHostCheckCommand,
      "default import requests must not import `superpowers`",
      "explicit import route returns `200`",
      "imported agent count == `1`",
      "sync-existing updated count >= `1`",
      "`Superpowers Workflow Operator`",
      "`superpowers/workflow-operator`",
    ]);
    checks.push({ id: "superpowers-contract-required-terms", ok: required.ok, reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}` });
  }

  if (forgeRecord) {
    const required = includesAll(forgeRecord, [
      "explicit-only bounded workflow operator import lane",
      "npm run forge:superpowers:smoke",
      "npm run check:directive-superpowers-forge",
      "npm run check:agents-import-packs-api-backend",
      "npm run check:ops-stack",
    ]);
    checks.push({ id: "superpowers-forge-record-required-terms", ok: required.ok, reason: required.ok ? null : `missing forge-record terms: ${required.missing.join(", ")}` });
  }

  if (proof) {
    const required = includesAll(proof, [
      `Quality gate profile: ${profile.id}`,
      `Promotion profile family: ${profile.family}`,
      `Proof shape: ${profile.proofShape}`,
      `Primary host checker: \`${profile.primaryHostCheckCommand}\``,
      "Default import superpowers count: `0`",
      "Imported agent count: `1`",
      "Updated existing count: `1`",
      "`Superpowers Workflow Operator`",
      "`superpowers/workflow-operator`",
      "`npm run forge:superpowers:smoke` -> PASS",
      "`npm run check:agents-import-packs-api-backend` -> PASS",
      "`npm run check:ops-stack` -> PASS",
    ]);
    checks.push({ id: "superpowers-proof-required-terms", ok: required.ok, reason: required.ok ? null : `missing proof terms: ${required.missing.join(", ")}` });
  }

  if (promotion) {
    const required = includesAll(promotion, [
      profile.id,
      profile.family,
      profile.proofShape,
      profile.primaryHostCheckCommand,
      "callable (bounded-workflow-operator-import-lane)",
      "check:agents-import-packs-api-backend",
      "check:directive-superpowers-forge",
    ]);
    checks.push({ id: "superpowers-promotion-required-terms", ok: required.ok, reason: required.ok ? null : `missing promotion terms: ${required.missing.join(", ")}` });
  }

  if (registry) {
    const required = includesAll(registry, ["callable (bounded-workflow-operator-import-lane)", "check:ops-stack"]);
    checks.push({ id: "superpowers-registry-required-terms", ok: required.ok, reason: required.ok ? null : `missing registry terms: ${required.missing.join(", ")}` });
  }

  if (importPacksService) {
    const required = includesAll(importPacksService, [
      "\"superpowers\"",
      "Superpowers Workflow Operator",
      "superpowers/workflow-operator",
      "resolveSuperpowersRootFromBackendCwd",
    ]);
    checks.push({ id: "superpowers-import-service-required-terms", ok: required.ok, reason: required.ok ? null : `missing import-service terms: ${required.missing.join(", ")}` });
  }

  if (latestReport) {
    const parsed = JSON.parse(latestReport) as SuperpowersSmokeReport;
    const assetLabels = Array.isArray(parsed.importedAgent?.packAssetLabels) ? parsed.importedAgent?.packAssetLabels || [] : [];
    const archivePathOk = typeof parsed.archivePath === "string" && parsed.archivePath.length > 0 && fs.existsSync(parsed.archivePath);
    checks.push({
      id: "superpowers-latest-report-thresholds",
      ok:
        parsed.suite === "superpowers-import-smoke" &&
        parsed.ok === true &&
        parsed.sourcePack === "superpowers" &&
        Number(parsed.defaultImportSuperpowersCount ?? -1) === 0 &&
        Number(parsed.importedCount ?? 0) >= 1 &&
        Number(parsed.updatedCount ?? 0) >= 1 &&
        parsed.importedAgent?.name === "Superpowers Workflow Operator" &&
        parsed.importedAgent?.sourcePack === "superpowers" &&
        parsed.importedAgent?.sourceRef === "superpowers/workflow-operator" &&
        parsed.importedAgent?.workflowMode === "execution" &&
        ["README.md", "skills", "commands", "docs", "agents"].every((label) => assetLabels.includes(label)) &&
        archivePathOk,
      reason:
        parsed.suite === "superpowers-import-smoke" &&
        parsed.ok === true &&
        parsed.sourcePack === "superpowers" &&
        Number(parsed.defaultImportSuperpowersCount ?? -1) === 0 &&
        Number(parsed.importedCount ?? 0) >= 1 &&
        Number(parsed.updatedCount ?? 0) >= 1 &&
        parsed.importedAgent?.name === "Superpowers Workflow Operator" &&
        parsed.importedAgent?.sourcePack === "superpowers" &&
        parsed.importedAgent?.sourceRef === "superpowers/workflow-operator" &&
        parsed.importedAgent?.workflowMode === "execution" &&
        ["README.md", "skills", "commands", "docs", "agents"].every((label) => assetLabels.includes(label)) &&
        archivePathOk
          ? null
          : `latest report invalid: ok=${parsed.ok} defaultImportSuperpowersCount=${parsed.defaultImportSuperpowersCount} importedCount=${parsed.importedCount} updatedCount=${parsed.updatedCount} sourcePack=${parsed.sourcePack} agent=${JSON.stringify(parsed.importedAgent)} archivePathOk=${archivePathOk} error=${parsed.error || "none"}`,
    });
  }

  const failed = checks.filter((check) => !check.ok);
  const output = { ok: failed.length === 0, metrics: { totalChecks: checks.length, failedChecks: failed.length }, checks };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failed.length > 0) process.exit(1);
}

main();
