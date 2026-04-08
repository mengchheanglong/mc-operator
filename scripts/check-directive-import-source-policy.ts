import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getDirectiveForgeImportSourcePolicyPath,
  getForgeImportSourcePolicyEntry,
  listForgeImportSourcePolicyEntries,
  listForgeSourcePackCatalogEntries,
} from "@/server/paths/directive-source-packs";

const EXPECTED_DEFAULT_IMPORT = ["agency-agents", "skills-manager"];
const EXPECTED_EXPLICIT_IMPORT_ONLY = [
  "arscontexta",
  "software-design-philosophy-skill",
  "superpowers",
];
const EXPECTED_BLOCKED = ["agent-orchestrator", "celtrix", "impeccable"];

function main() {
  const policyPath = getDirectiveForgeImportSourcePolicyPath();
  const policyEntries = listForgeImportSourcePolicyEntries();
  const catalogEntries = listForgeSourcePackCatalogEntries();
  const catalogMap = new Map(catalogEntries.map((entry) => [entry.id, entry]));

  const policyIds = policyEntries.map((entry) => entry.id);
  const defaultImport = policyEntries
    .filter((entry) => entry.availability === "default_import")
    .map((entry) => entry.id)
    .sort();
  const explicitImportOnly = policyEntries
    .filter((entry) => entry.availability === "explicit_import_only")
    .map((entry) => entry.id)
    .sort();
  const blocked = policyEntries
    .filter((entry) => entry.availability === "blocked")
    .map((entry) => entry.id)
    .sort();

  const checks = [
    {
      id: "policy-file-exists",
      ok: fs.existsSync(policyPath),
      reason: null as string | null,
    },
    {
      id: "policy-entry-ids-unique",
      ok: new Set(policyIds).size === policyIds.length,
      reason: null as string | null,
    },
    {
      id: "default-import-set-correct",
      ok: JSON.stringify(defaultImport) === JSON.stringify(EXPECTED_DEFAULT_IMPORT),
      reason: `actual=${defaultImport.join(", ")}`,
    },
    {
      id: "explicit-import-only-set-correct",
      ok: JSON.stringify(explicitImportOnly) === JSON.stringify(EXPECTED_EXPLICIT_IMPORT_ONLY),
      reason: `actual=${explicitImportOnly.join(", ")}`,
    },
    {
      id: "blocked-set-correct",
      ok: JSON.stringify(blocked) === JSON.stringify(EXPECTED_BLOCKED),
      reason: `actual=${blocked.join(", ")}`,
    },
    {
      id: "all-policy-ids-cataloged",
      ok: policyEntries.every((entry) => catalogMap.has(entry.id)),
      reason: null as string | null,
    },
    {
      id: "policy-classification-and-activation-match-catalog",
      ok: policyEntries.every((entry) => {
        const catalogEntry = catalogMap.get(entry.id);
        if (!catalogEntry) return false;
        return (
          catalogEntry.classification === entry.requiredClassification &&
          catalogEntry.activationMode === entry.requiredActivationMode
        );
      }),
      reason: null as string | null,
    },
    {
      id: "blocked-sources-resolve-to-blocked-policy",
      ok: EXPECTED_BLOCKED.every((id) => getForgeImportSourcePolicyEntry(id)?.availability === "blocked"),
      reason: null as string | null,
    },
  ];

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
      policyEntryCount: policyEntries.length,
    },
    policyPath,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  assert.equal(failed.length, 0);
}

main();
