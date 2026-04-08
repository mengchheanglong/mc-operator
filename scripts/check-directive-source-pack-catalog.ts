import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getDirectiveForgeSourcePackCatalogPath,
  getDirectiveForgeSourcePacksRoot,
  listForgeSourcePackCatalogEntries,
} from "@/server/paths/directive-source-packs";

function main() {
  const sourcePacksRoot = getDirectiveForgeSourcePacksRoot();
  const catalogPath = getDirectiveForgeSourcePackCatalogPath();
  const entries = listForgeSourcePackCatalogEntries();

  const actualDirs = fs
    .readdirSync(sourcePacksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const catalogIds = entries.map((entry) => entry.id).sort();
  const liveRuntime = entries.filter((entry) => entry.classification === "live_runtime");

  const checks = [
    {
      id: "catalog-file-exists",
      ok: fs.existsSync(catalogPath),
      reason: null as string | null,
    },
    {
      id: "all-source-pack-dirs-cataloged",
      ok: JSON.stringify(actualDirs) === JSON.stringify(catalogIds),
      reason:
        JSON.stringify(actualDirs) === JSON.stringify(catalogIds)
          ? null
          : `actualDirs=${actualDirs.join(", ")} catalogIds=${catalogIds.join(", ")}`,
    },
    {
      id: "live-runtime-packs-ready",
      ok: liveRuntime.every((entry) =>
        fs.existsSync(path.join(sourcePacksRoot, entry.id, "SOURCE_PACK_READY.md")),
      ),
      reason: null,
    },
    {
      id: "resolver-packs-live-runtime",
      ok: ["agency-agents", "desloppify"].every((id) =>
        entries.some((entry) => entry.id === id && entry.classification === "live_runtime"),
      ),
      reason: null,
    },
    {
      id: "agent-orchestrator-pack-follow-up-only",
      ok: entries.some(
        (entry) =>
          entry.id === "agent-orchestrator" &&
          entry.classification === "follow_up_only" &&
          entry.activationMode === "manual_follow_up",
      ),
      reason: null,
    },
    {
      id: "promptfoo-pack-live-runtime",
      ok: entries.some(
        (entry) =>
          entry.id === "promptfoo" &&
          entry.classification === "live_runtime" &&
          entry.activationMode === "bounded_eval_lane",
      ),
      reason: null,
    },
    {
      id: "puppeteer-pack-live-runtime",
      ok: entries.some(
        (entry) =>
          entry.id === "puppeteer" &&
          entry.classification === "live_runtime" &&
          entry.activationMode === "bounded_browser_lane",
      ),
      reason: null,
    },
    {
      id: "skills-manager-pack-live-runtime",
      ok: entries.some(
        (entry) =>
          entry.id === "skills-manager" &&
          entry.classification === "live_runtime" &&
          entry.activationMode === "agent_pack_import_lane",
      ),
      reason: null,
    },
    {
      id: "arscontexta-pack-live-runtime",
      ok: entries.some(
        (entry) =>
          entry.id === "arscontexta" &&
          entry.classification === "live_runtime" &&
          entry.activationMode === "agent_pack_import_lane",
      ),
      reason: null,
    },
    {
      id: "design-philosophy-pack-live-runtime",
      ok: entries.some(
        (entry) =>
          entry.id === "software-design-philosophy-skill" &&
          entry.classification === "live_runtime" &&
          entry.activationMode === "agent_pack_import_lane",
      ),
      reason: null,
    },
    {
      id: "scripts-pack-reference-only",
      ok: entries.some(
        (entry) =>
          entry.id === "scripts" &&
          entry.classification === "reference_only",
      ),
      reason: null,
    },
    {
      id: "architecture-derived-packs-not-live-runtime",
      ok: ["celtrix", "impeccable"].every((id) =>
        entries.some((entry) => entry.id === id && entry.classification !== "live_runtime"),
      ),
      reason: null,
    },
  ];

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
      catalogedPackCount: entries.length,
      liveRuntimeCount: liveRuntime.length,
    },
    catalogPath,
    sourcePacksRoot,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  assert.equal(failed.length, 0);
}

main();
