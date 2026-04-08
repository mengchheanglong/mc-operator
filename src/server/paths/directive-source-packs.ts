import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveDirectiveWorkspaceRoot } from "@/server/paths/directive-workspace-root";

export type ForgeSourcePackClassification =
  | "live_runtime"
  | "follow_up_only"
  | "reference_only";

export type ForgeSourcePackActivationMode =
  | "resolver"
  | "bounded_eval_lane"
  | "bounded_browser_lane"
  | "agent_pack_import_lane"
  | "manual_follow_up"
  | "reference_only";

export interface ForgeSourcePackCatalogEntry {
  id: string;
  label: string;
  classification: ForgeSourcePackClassification;
  activationMode: ForgeSourcePackActivationMode;
  hostConsumers: string[];
  note: string;
}

export interface ForgeSourcePackCatalog {
  status: string;
  updatedAt: string;
  policy: {
    readyMarkerMeaning: string;
    runtimeActivationRule: string;
    nonLiveRule: string;
  };
  packs: ForgeSourcePackCatalogEntry[];
}

export type ForgeImportSourceAvailability =
  | "default_import"
  | "explicit_import_only"
  | "blocked";

export interface ForgeImportSourcePolicyEntry {
  id: string;
  availability: ForgeImportSourceAvailability;
  requiredClassification: ForgeSourcePackClassification;
  requiredActivationMode: ForgeSourcePackActivationMode;
  note: string;
}

export interface ForgeImportSourcePolicy {
  status: string;
  updatedAt: string;
  policy: {
    defaultImportRule: string;
    explicitImportRule: string;
    blockedRule: string;
  };
  sources: ForgeImportSourcePolicyEntry[];
}

export function getDirectiveWorkspaceRoot() {
  return resolveDirectiveWorkspaceRoot();
}

export function getDirectiveForgeSourcePacksRoot() {
  return path.join(getDirectiveWorkspaceRoot(), "forge", "source-packs");
}

export function getDirectiveForgeSourcePackCatalogPath() {
  return path.join(getDirectiveForgeSourcePacksRoot(), "CATALOG.json");
}

export function getDirectiveForgeImportSourcePolicyPath() {
  return path.join(getDirectiveWorkspaceRoot(), "forge", "IMPORT_SOURCE_POLICY.json");
}

export function getForgeSourcePackPath(packName: string) {
  return path.join(getDirectiveForgeSourcePacksRoot(), packName);
}

const SOURCE_PACK_READY_MARKER = "SOURCE_PACK_READY.md";

export function loadForgeSourcePackCatalog(): ForgeSourcePackCatalog {
  return JSON.parse(
    readFileSync(getDirectiveForgeSourcePackCatalogPath(), "utf8"),
  ) as ForgeSourcePackCatalog;
}

export function loadForgeImportSourcePolicy(): ForgeImportSourcePolicy {
  return JSON.parse(
    readFileSync(getDirectiveForgeImportSourcePolicyPath(), "utf8"),
  ) as ForgeImportSourcePolicy;
}

export function listForgeSourcePackCatalogEntries() {
  return loadForgeSourcePackCatalog().packs;
}

export function getForgeSourcePackCatalogEntry(packName: string) {
  return (
    listForgeSourcePackCatalogEntries().find((entry) => entry.id === packName) ||
    null
  );
}

export function listForgeImportSourcePolicyEntries() {
  return loadForgeImportSourcePolicy().sources;
}

export function getForgeImportSourcePolicyEntry(packName: string) {
  return (
    listForgeImportSourcePolicyEntries().find((entry) => entry.id === packName) ||
    null
  );
}

function resolveLiveRuntimeForgeSourcePackPath(packNames: string[]) {
  const liveEntry = packNames
    .map((packName) => getForgeSourcePackCatalogEntry(packName))
    .find((entry): entry is ForgeSourcePackCatalogEntry => {
      if (!entry) return false;
      return entry.classification === "live_runtime";
    });

  if (!liveEntry) return null;

  const candidate = getForgeSourcePackPath(liveEntry.id);
  return existsSync(path.join(candidate, SOURCE_PACK_READY_MARKER))
    ? candidate
    : null;
}

function canonicalForgePackPath(packNames: string[]) {
  return getForgeSourcePackPath(packNames[0]!);
}

function requireLiveRuntimeForgePackRoot(packNames: string[]) {
  const cataloged = packNames
    .map((packName) => getForgeSourcePackCatalogEntry(packName))
    .find((entry): entry is ForgeSourcePackCatalogEntry => Boolean(entry));

  if (!cataloged) {
    throw new Error(
      `directive_source_pack_missing_catalog_entry: expected catalog entry for ${packNames.join(", ")}`,
    );
  }

  if (cataloged.classification !== "live_runtime") {
    throw new Error(
      `directive_source_pack_inactive: expected live_runtime classification for ${packNames.join(", ")}`,
    );
  }

  const liveForgePath = resolveLiveRuntimeForgeSourcePackPath(packNames);
  if (liveForgePath) return liveForgePath;
  throw new Error(
    `directive_source_pack_not_ready: expected SOURCE_PACK_READY.md for ${packNames.join(", ")}`,
  );
}

export function getAgencyAgentsSourcePackPath() {
  return canonicalForgePackPath(["agency-agents"]);
}

export function getDesloppifySourcePackPath() {
  return canonicalForgePackPath(["desloppify"]);
}

export function getAgentOrchestratorSourcePackPath() {
  return canonicalForgePackPath(["agent-orchestrator"]);
}

export function resolveAgencyAgentsSourceRoot() {
  return requireLiveRuntimeForgePackRoot(["agency-agents"]);
}

export function resolveDesloppifySourceRoot() {
  return requireLiveRuntimeForgePackRoot(["desloppify"]);
}

export function resolveAgentOrchestratorRoot() {
  return requireLiveRuntimeForgePackRoot([
    "agent-orchestrator",
    "agent_orchestrator",
    "ao",
  ]);
}
