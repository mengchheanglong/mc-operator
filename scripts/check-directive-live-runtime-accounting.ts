import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getDirectiveForgeSourcePackCatalogPath,
  listForgeSourcePackCatalogEntries,
} from "@/server/paths/directive-source-packs";
import {
  directiveWorkspaceRoot,
  loadForgePromotionProfileCatalog,
} from "./directive-promotion-profile-lib";

type AccountingEntry = {
  id: string;
  classification: string;
  activationMode: string;
  accountingMode: "promoted_runtime" | "legacy_runtime_normalized";
  promotionProfile: string;
  forgeRecordPath: string;
  proofPath: string;
  promotionRecordPath: string;
  registryEntryPath: string;
  runtimeSurface: string;
  primaryHostChecker: string;
  supportingHostEvidenceCommand: string;
  hostConsumers: string[];
  note: string;
};

type AccountingCatalog = {
  status: string;
  updatedAt: string;
  policy: {
    requiredRule: string;
    accountingModeRule: string;
    proofRule: string;
    hostRule: string;
  };
  entries: AccountingEntry[];
};

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

const liveRuntimeAccountingPath = path.resolve(
  directiveWorkspaceRoot,
  "forge",
  "LIVE_RUNTIME_ACCOUNTING.json",
);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function main() {
  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const packageJson = readJson<{ scripts?: Record<string, string> }>(packageJsonPath);
  const promotionProfileCatalog = loadForgePromotionProfileCatalog();
  const accountingCatalog = readJson<AccountingCatalog>(liveRuntimeAccountingPath);
  const liveRuntimeEntries = listForgeSourcePackCatalogEntries().filter(
    (entry) => entry.classification === "live_runtime",
  );

  const liveIds = liveRuntimeEntries.map((entry) => entry.id).sort();
  const accountingIds = accountingCatalog.entries.map((entry) => entry.id).sort();

  const checks: Check[] = [
    {
      id: "accounting-file-exists",
      ok: fs.existsSync(liveRuntimeAccountingPath),
      reason: fs.existsSync(liveRuntimeAccountingPath)
        ? null
        : `missing accounting file: ${liveRuntimeAccountingPath}`,
    },
    {
      id: "all-live-runtime-packs-accounted-for",
      ok: JSON.stringify(liveIds) === JSON.stringify(accountingIds),
      reason:
        JSON.stringify(liveIds) === JSON.stringify(accountingIds)
          ? null
          : `catalogLive=${liveIds.join(", ")} accounting=${accountingIds.join(", ")}`,
    },
  ];

  for (const entry of accountingCatalog.entries) {
    const catalogEntry = liveRuntimeEntries.find((item) => item.id === entry.id);
    const profile = promotionProfileCatalog.profiles.find(
      (item) => item.id === entry.promotionProfile,
    );
    const supportingScript = entry.supportingHostEvidenceCommand.replace("npm run ", "");

    checks.push({
      id: `catalog-entry-present:${entry.id}`,
      ok: Boolean(catalogEntry),
      reason: catalogEntry ? null : `missing live_runtime catalog entry for ${entry.id}`,
    });

    checks.push({
      id: `classification-matches:${entry.id}`,
      ok: entry.classification === "live_runtime" && catalogEntry?.classification === "live_runtime",
      reason:
        entry.classification === "live_runtime" && catalogEntry?.classification === "live_runtime"
          ? null
          : `expected live_runtime classification for ${entry.id}`,
    });

    checks.push({
      id: `activation-mode-matches:${entry.id}`,
      ok: entry.activationMode === catalogEntry?.activationMode,
      reason:
        entry.activationMode === catalogEntry?.activationMode
          ? null
          : `catalog=${catalogEntry?.activationMode ?? "(missing)"} accounting=${entry.activationMode}`,
    });

    checks.push({
      id: `host-consumers-match:${entry.id}`,
      ok:
        JSON.stringify([...(entry.hostConsumers || [])].sort()) ===
        JSON.stringify([...(catalogEntry?.hostConsumers || [])].sort()),
      reason:
        JSON.stringify([...(entry.hostConsumers || [])].sort()) ===
        JSON.stringify([...(catalogEntry?.hostConsumers || [])].sort())
          ? null
          : `catalog=${(catalogEntry?.hostConsumers || []).join(", ")} accounting=${(entry.hostConsumers || []).join(", ")}`,
    });

    checks.push({
      id: `profile-cataloged:${entry.id}`,
      ok: Boolean(profile),
      reason: profile ? null : `missing promotion profile: ${entry.promotionProfile}`,
    });

    checks.push({
      id: `primary-host-checker-matches-profile:${entry.id}`,
      ok: entry.primaryHostChecker === profile?.primaryHostCheckCommand,
      reason:
        entry.primaryHostChecker === profile?.primaryHostCheckCommand
          ? null
          : `profile=${profile?.primaryHostCheckCommand ?? "(missing)"} accounting=${entry.primaryHostChecker}`,
    });

    checks.push({
      id: `supporting-command-defined:${entry.id}`,
      ok: Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, supportingScript),
      reason: Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, supportingScript)
        ? null
        : `missing package script for ${entry.supportingHostEvidenceCommand}`,
    });

    for (const [label, filePath] of [
      ["forge-record", entry.forgeRecordPath],
      ["proof", entry.proofPath],
      ["promotion-record", entry.promotionRecordPath],
      ["registry-entry", entry.registryEntryPath],
    ] as const) {
      checks.push({
        id: `${label}-exists:${entry.id}`,
        ok: fs.existsSync(filePath),
        reason: fs.existsSync(filePath) ? null : `missing file: ${filePath}`,
      });
    }
  }

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
      liveRuntimePackCount: liveRuntimeEntries.length,
      accountingEntryCount: accountingCatalog.entries.length,
    },
    accountingPath: liveRuntimeAccountingPath,
    catalogPath: getDirectiveForgeSourcePackCatalogPath(),
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  assert.equal(failed.length, 0);
}

main();
