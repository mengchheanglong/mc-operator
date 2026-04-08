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

type ArscontextaSmokeReport = {
  suite?: string;
  ok?: boolean;
  generatedAt?: string;
  sourcePack?: string;
  defaultImportArscontextaCount?: number;
  importedCount?: number;
  updatedCount?: number;
  importedAgents?: Array<{
    name?: string;
    sourcePack?: string;
    sourceRef?: string;
    workflowMode?: string;
    packAssetLabels?: string[];
  }>;
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
  const profile = getForgePromotionProfile("context_operator_import_guard/v1");

  const forgeRecordPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-arscontexta-forge-record.md",
  );
  const proofPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-arscontexta-runtime-slice-01-proof.md",
  );
  const promotionPath = path.join(
    directiveRoot,
    "forge",
    "promotion-records",
    "2026-03-21-arscontexta-promotion-record.md",
  );
  const registryPath = path.join(
    directiveRoot,
    "forge",
    "registry",
    "2026-03-21-arscontexta-registry-entry.md",
  );
  const contractPath = resolveDirectiveWorkspacePath(profile.contractPath);
  const latestReportPath = path.join(
    workspaceRoot,
    "reports",
    "agent-pack-imports",
    "arscontexta-latest.json",
  );
  const packRoot = getForgeSourcePackPath("arscontexta");
  const packReadyPath = path.join(packRoot, "SOURCE_PACK_READY.md");
  const sourcePackEntry = getForgeSourcePackCatalogEntry("arscontexta");
  const importPacksServicePath = path.join(
    workspaceRoot,
    "backend",
    "src",
    "modules",
    "agents-import-packs",
    "agents-import-packs.service.ts",
  );

  const checks: Check[] = [];

  const forgeRecord = readIfExists(forgeRecordPath);
  const proof = readIfExists(proofPath);
  const promotion = readIfExists(promotionPath);
  const registry = readIfExists(registryPath);
  const contract = readIfExists(contractPath);
  const latestReport = readIfExists(latestReportPath);
  const importPacksService = readIfExists(importPacksServicePath);

  checks.push({
    id: "arscontexta-forge-record-exists",
    ok: Boolean(forgeRecord),
    reason: forgeRecord ? null : `missing forge record: ${forgeRecordPath}`,
  });
  checks.push({
    id: "arscontexta-proof-exists",
    ok: Boolean(proof),
    reason: proof ? null : `missing proof: ${proofPath}`,
  });
  checks.push({
    id: "arscontexta-promotion-exists",
    ok: Boolean(promotion),
    reason: promotion ? null : `missing promotion record: ${promotionPath}`,
  });
  checks.push({
    id: "arscontexta-registry-exists",
    ok: Boolean(registry),
    reason: registry ? null : `missing registry entry: ${registryPath}`,
  });
  checks.push({
    id: "arscontexta-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "arscontexta-latest-report-exists",
    ok: Boolean(latestReport),
    reason: latestReport ? null : `missing latest import smoke report: ${latestReportPath}`,
  });
  checks.push({
    id: "arscontexta-source-pack-ready",
    ok: fs.existsSync(packReadyPath),
    reason: fs.existsSync(packReadyPath) ? null : `missing ready marker: ${packReadyPath}`,
  });
  checks.push({
    id: "arscontexta-source-pack-live-runtime",
    ok:
      sourcePackEntry?.classification === "live_runtime" &&
      sourcePackEntry.activationMode === "agent_pack_import_lane",
    reason:
      sourcePackEntry?.classification === "live_runtime" &&
      sourcePackEntry.activationMode === "agent_pack_import_lane"
        ? null
        : `unexpected source-pack classification: ${JSON.stringify(sourcePackEntry)}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      profile.id,
      profile.family,
      profile.proofShape,
      profile.primaryHostCheckCommand,
      "default import requests must not import `arscontexta`",
      "explicit import route returns `200`",
      "imported agent count == `3`",
      "sync-existing updated count >= `3`",
      "`arscontexta/context-architect`",
      "`arscontexta/delivery-builder`",
      "`arscontexta/quality-reviewer`",
    ]);
    checks.push({
      id: "arscontexta-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (forgeRecord) {
    const required = includesAll(forgeRecord, [
      "bounded context operator import lane",
      "explicit-only",
      "npm run forge:arscontexta:smoke",
      "npm run check:directive-arscontexta-forge",
      "npm run check:agents-import-packs-api-backend",
      "npm run check:ops-stack",
    ]);
    checks.push({
      id: "arscontexta-forge-record-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing forge-record terms: ${required.missing.join(", ")}`,
    });
  }

  if (proof) {
    const required = includesAll(proof, [
      `Quality gate profile: ${profile.id}`,
      `Promotion profile family: ${profile.family}`,
      `Proof shape: ${profile.proofShape}`,
      `Primary host checker: \`${profile.primaryHostCheckCommand}\``,
      "Default import arscontexta count: `0`",
      "Imported agent count: `3`",
      "Updated existing count: `3`",
      "`Ars Context Architect`",
      "`Ars Delivery Builder`",
      "`Ars Quality Reviewer`",
      "`npm run forge:arscontexta:smoke` -> PASS",
      "`npm run check:agents-import-packs-api-backend` -> PASS",
      "`npm run check:ops-stack` -> PASS",
    ]);
    checks.push({
      id: "arscontexta-proof-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing proof terms: ${required.missing.join(", ")}`,
    });
  }

  if (promotion) {
    const required = includesAll(promotion, [
      profile.id,
      profile.family,
      profile.proofShape,
      profile.primaryHostCheckCommand,
      "callable (bounded-context-operator-import-lane)",
      "check:agents-import-packs-api-backend",
      "check:directive-arscontexta-forge",
    ]);
    checks.push({
      id: "arscontexta-promotion-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing promotion terms: ${required.missing.join(", ")}`,
    });
  }

  if (registry) {
    const required = includesAll(registry, [
      "callable (bounded-context-operator-import-lane)",
      "check:ops-stack",
    ]);
    checks.push({
      id: "arscontexta-registry-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing registry terms: ${required.missing.join(", ")}`,
    });
  }

  if (importPacksService) {
    const required = includesAll(importPacksService, [
      "\"arscontexta\"",
      "Ars Context Architect",
      "Ars Delivery Builder",
      "Ars Quality Reviewer",
      "arscontexta/context-architect",
      "arscontexta/delivery-builder",
      "arscontexta/quality-reviewer",
      "resolveArscontextaSourceRootFromBackendCwd",
    ]);
    checks.push({
      id: "arscontexta-import-service-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing import-service terms: ${required.missing.join(", ")}`,
    });
  }

  if (latestReport) {
    const parsed = JSON.parse(latestReport) as ArscontextaSmokeReport;
    const agents = Array.isArray(parsed.importedAgents) ? parsed.importedAgents : [];
    const names = agents.map((agent) => String(agent.name || "")).sort();
    const refs = agents.map((agent) => String(agent.sourceRef || "")).sort();
    const modes = agents.map((agent) => String(agent.workflowMode || "")).sort();
    const archivePathOk =
      typeof parsed.archivePath === "string" &&
      parsed.archivePath.length > 0 &&
      fs.existsSync(parsed.archivePath);
    const requiredLabels = ["README.md", "methodology", "reference", "skills", "skill-sources"];
    const assetsOk = agents.every((agent) => {
      const labels = Array.isArray(agent.packAssetLabels) ? agent.packAssetLabels : [];
      return requiredLabels.every((label) => labels.includes(label));
    });

    checks.push({
      id: "arscontexta-latest-report-thresholds",
      ok:
        parsed.suite === "arscontexta-import-smoke" &&
        parsed.ok === true &&
        parsed.sourcePack === "arscontexta" &&
        Number(parsed.defaultImportArscontextaCount ?? -1) === 0 &&
        Number(parsed.importedCount ?? 0) === 3 &&
        Number(parsed.updatedCount ?? 0) >= 3 &&
        JSON.stringify(names) ===
          JSON.stringify(
            ["Ars Context Architect", "Ars Delivery Builder", "Ars Quality Reviewer"].sort(),
          ) &&
        JSON.stringify(refs) ===
          JSON.stringify(
            [
              "arscontexta/context-architect",
              "arscontexta/delivery-builder",
              "arscontexta/quality-reviewer",
            ].sort(),
          ) &&
        JSON.stringify(modes) === JSON.stringify(["execution", "planning", "review"].sort()) &&
        assetsOk &&
        archivePathOk,
      reason:
        parsed.suite === "arscontexta-import-smoke" &&
        parsed.ok === true &&
        parsed.sourcePack === "arscontexta" &&
        Number(parsed.defaultImportArscontextaCount ?? -1) === 0 &&
        Number(parsed.importedCount ?? 0) === 3 &&
        Number(parsed.updatedCount ?? 0) >= 3 &&
        JSON.stringify(names) ===
          JSON.stringify(
            ["Ars Context Architect", "Ars Delivery Builder", "Ars Quality Reviewer"].sort(),
          ) &&
        JSON.stringify(refs) ===
          JSON.stringify(
            [
              "arscontexta/context-architect",
              "arscontexta/delivery-builder",
              "arscontexta/quality-reviewer",
            ].sort(),
          ) &&
        JSON.stringify(modes) === JSON.stringify(["execution", "planning", "review"].sort()) &&
        assetsOk &&
        archivePathOk
          ? null
          : `latest report invalid: ok=${parsed.ok} defaultImportArscontextaCount=${parsed.defaultImportArscontextaCount} importedCount=${parsed.importedCount} updatedCount=${parsed.updatedCount} sourcePack=${parsed.sourcePack} agents=${JSON.stringify(parsed.importedAgents)} archivePathOk=${archivePathOk} error=${parsed.error || "none"}`,
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
