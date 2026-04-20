import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  forgePromotionProfileCatalogPath,
  loadForgePromotionProfileCatalog,
  resolveDirectiveWorkspacePath,
  resolveMissionControlPath,
} from "../lib/promotion-profiles";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

function listPromotionRecordFiles(dirPath: string) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith("-promotion-record.md") &&
        entry.name !== "README.md",
    )
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getFieldValue(content: string, label: string) {
  const pattern = new RegExp(`-\\s*${escapeRegex(label)}:\\s*(.*)$`, "im");
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function main() {
  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(readText(packageJsonPath)) as {
    scripts?: Record<string, string>;
  };
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const promotionDir = path.join(directiveRoot, "forge", "promotion-records");
  const recordFiles = listPromotionRecordFiles(promotionDir);
  const catalog = loadForgePromotionProfileCatalog();
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const profile of catalog.profiles) {
    if (seenIds.has(profile.id)) duplicateIds.add(profile.id);
    seenIds.add(profile.id);
  }

  const checks: Check[] = [
    {
      id: "catalog-file-exists",
      ok: fs.existsSync(forgePromotionProfileCatalogPath),
      reason: fs.existsSync(forgePromotionProfileCatalogPath)
        ? null
        : `missing catalog: ${forgePromotionProfileCatalogPath}`,
    },
    {
      id: "required-profiles-present",
      ok:
        catalog.profiles.some((profile) => profile.id === "design_review_skill_guard/v1") &&
        catalog.profiles.some((profile) => profile.id === "context_operator_import_guard/v1") &&
        catalog.profiles.some((profile) => profile.id === "legacy_live_runtime_guard/v1") &&
        catalog.profiles.some((profile) => profile.id === "promotion_quality_gate/v1") &&
        catalog.profiles.some((profile) => profile.id === "agent_eval_guard/v1") &&
        catalog.profiles.some((profile) => profile.id === "browser_smoke_guard/v1") &&
        catalog.profiles.some((profile) => profile.id === "skill_lifecycle_guard/v1"),
      reason: null,
    },
    {
      id: "profile-ids-unique",
      ok: duplicateIds.size === 0,
      reason:
        duplicateIds.size === 0
          ? null
          : `duplicate profile ids: ${Array.from(duplicateIds).join(", ")}`,
    },
  ];

  for (const profile of catalog.profiles) {
    const contractPath = resolveDirectiveWorkspacePath(profile.contractPath);
    const hostCheckPath = resolveMissionControlPath(profile.primaryHostCheckScriptPath);
    const scriptName = profile.primaryHostCheckCommand.replace("npm run ", "");
    checks.push({
      id: `contract-exists:${profile.id}`,
      ok: fs.existsSync(contractPath),
      reason: fs.existsSync(contractPath) ? null : `missing contract: ${contractPath}`,
    });
    checks.push({
      id: `host-check-script-exists:${profile.id}`,
      ok: fs.existsSync(hostCheckPath),
      reason: fs.existsSync(hostCheckPath) ? null : `missing host check script: ${hostCheckPath}`,
    });
    checks.push({
      id: `host-check-command-defined:${profile.id}`,
      ok: Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, scriptName),
      reason: Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, scriptName)
        ? null
        : `missing package script for ${profile.primaryHostCheckCommand}`,
    });
  }

  let mismatchedRecords = 0;
  let uncatalogedRecords = 0;
  const usageCounts = Object.fromEntries(catalog.profiles.map((profile) => [profile.id, 0]));

  for (const recordPath of recordFiles) {
    const content = readText(recordPath);
    const profileId = getFieldValue(content, "Quality gate profile");
    const family = getFieldValue(content, "Promotion profile family");
    const proofShape = getFieldValue(content, "Proof shape");
    const primaryHostChecker = String(
      getFieldValue(content, "Primary host checker") || "",
    ).replaceAll("`", "");
    const matched = catalog.profiles.find((profile) => profile.id === profileId);

    if (!matched) {
      uncatalogedRecords += 1;
      continue;
    }

    usageCounts[matched.id] = Number(usageCounts[matched.id] || 0) + 1;

    if (
      family !== matched.family ||
      proofShape !== matched.proofShape ||
      primaryHostChecker !== matched.primaryHostCheckCommand
    ) {
      mismatchedRecords += 1;
    }
  }

  checks.push({
    id: "all-promotion-record-profiles-cataloged",
    ok: uncatalogedRecords === 0,
    reason:
      uncatalogedRecords === 0
        ? null
        : `${uncatalogedRecords} promotion record(s) use uncataloged profile ids`,
  });
  checks.push({
    id: "promotion-record-fields-match-catalog",
    ok: mismatchedRecords === 0,
    reason:
      mismatchedRecords === 0
        ? null
        : `${mismatchedRecords} promotion record(s) have mismatched family/proof/checker fields`,
  });

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
      catalogedProfileCount: catalog.profiles.length,
      promotionRecordCount: recordFiles.length,
    },
    usageCounts,
    catalogPath: forgePromotionProfileCatalogPath,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  assert.equal(failed.length, 0);
}

main();
