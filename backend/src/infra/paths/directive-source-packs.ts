import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type ForgeSourcePackClassification =
  | "live_runtime"
  | "follow_up_only"
  | "reference_only";

type ForgeSourcePackActivationMode =
  | "resolver"
  | "bounded_eval_lane"
  | "bounded_browser_lane"
  | "agent_pack_import_lane"
  | "manual_follow_up"
  | "reference_only";

type ForgeSourcePackCatalogEntry = {
  id: string;
  classification: ForgeSourcePackClassification;
  activationMode: ForgeSourcePackActivationMode;
};

type ForgeSourcePackCatalog = {
  packs: ForgeSourcePackCatalogEntry[];
};

type ForgeImportSourceAvailability =
  | "default_import"
  | "explicit_import_only"
  | "blocked";

type ForgeImportSourcePolicyEntry = {
  id: string;
  availability: ForgeImportSourceAvailability;
  requiredClassification: ForgeSourcePackClassification;
  requiredActivationMode: ForgeSourcePackActivationMode;
};

type ForgeImportSourcePolicy = {
  sources: ForgeImportSourcePolicyEntry[];
};

export function getWorkspaceRootFromBackendCwd() {
  if (process.env.OPENCLAW_WORKSPACE_ROOT?.trim()) {
    return path.resolve(process.env.OPENCLAW_WORKSPACE_ROOT.trim());
  }
  return path.resolve(process.cwd(), "..", "..");
}

export function getDirectiveWorkspaceRootFromBackendCwd() {
  return path.join(getWorkspaceRootFromBackendCwd(), "directive-workspace");
}

export function getDirectiveForgeSourcePacksRootFromBackendCwd() {
  return path.join(getDirectiveWorkspaceRootFromBackendCwd(), "forge", "source-packs");
}

export function getDirectiveForgeSourcePackCatalogPathFromBackendCwd() {
  return path.join(getDirectiveForgeSourcePacksRootFromBackendCwd(), "CATALOG.json");
}

export function getDirectiveForgeImportSourcePolicyPathFromBackendCwd() {
  return path.join(getDirectiveWorkspaceRootFromBackendCwd(), "forge", "IMPORT_SOURCE_POLICY.json");
}

const SOURCE_PACK_READY_MARKER = "SOURCE_PACK_READY.md";

export function loadForgeSourcePackCatalogFromBackendCwd(): ForgeSourcePackCatalog {
  return JSON.parse(
    readFileSync(getDirectiveForgeSourcePackCatalogPathFromBackendCwd(), "utf8"),
  ) as ForgeSourcePackCatalog;
}

export function loadForgeImportSourcePolicyFromBackendCwd(): ForgeImportSourcePolicy {
  return JSON.parse(
    readFileSync(getDirectiveForgeImportSourcePolicyPathFromBackendCwd(), "utf8"),
  ) as ForgeImportSourcePolicy;
}

export function listForgeImportSourcePolicyEntriesFromBackendCwd() {
  return loadForgeImportSourcePolicyFromBackendCwd().sources;
}

export function getForgeImportSourcePolicyEntryFromBackendCwd(packName: string) {
  return listForgeImportSourcePolicyEntriesFromBackendCwd().find((entry) => entry.id === packName) || null;
}

export function getForgeSourcePackCatalogEntryFromBackendCwd(packNames: string[]) {
  const catalog = loadForgeSourcePackCatalogFromBackendCwd();
  return (
    packNames
      .map((packName) => catalog.packs.find((entry) => entry.id === packName) || null)
      .find(Boolean) || null
  );
}

export function isForgeSourcePackLiveRuntimeFromBackendCwd(packNames: string[]) {
  const entry = getForgeSourcePackCatalogEntryFromBackendCwd(packNames);
  return Boolean(entry && entry.classification === "live_runtime");
}

function firstExistingPath(candidates: string[]) {
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0]!;
}

function resolveReadyForgeSourcePackPathFromBackendCwd(packNames: string[]) {
  return packNames
    .map((packName) => path.join(getDirectiveForgeSourcePacksRootFromBackendCwd(), packName))
    .find((candidate) => existsSync(path.join(candidate, SOURCE_PACK_READY_MARKER)));
}

function requireLiveRuntimeForgeSourcePackPathFromBackendCwd(packNames: string[]) {
  const cataloged = getForgeSourcePackCatalogEntryFromBackendCwd(packNames);
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
  const readyForgePath = resolveReadyForgeSourcePackPathFromBackendCwd(packNames);
  if (readyForgePath) return readyForgePath;
  throw new Error(
    `directive_source_pack_not_ready: expected SOURCE_PACK_READY.md for ${packNames.join(", ")}`,
  );
}

function resolveForgePackRootFromCandidatesFromBackendCwd(packNames: string[]) {
  const readyForgePath = resolveReadyForgeSourcePackPathFromBackendCwd(packNames);
  if (readyForgePath) return readyForgePath;
  return firstExistingPath(
    packNames.map((packName) => path.join(getDirectiveForgeSourcePacksRootFromBackendCwd(), packName)),
  );
}

export function resolveAgencyAgentsSourceRootFromBackendCwd() {
  return requireLiveRuntimeForgeSourcePackPathFromBackendCwd(["agency-agents"]);
}

export function resolveArscontextaSourceRootFromBackendCwd() {
  return resolveForgePackRootFromCandidatesFromBackendCwd(["arscontexta"]);
}

export function resolveDesloppifySourceRootFromBackendCwd() {
  return requireLiveRuntimeForgeSourcePackPathFromBackendCwd(["desloppify"]);
}

export function resolveAgentOrchestratorRootFromBackendCwd() {
  return requireLiveRuntimeForgeSourcePackPathFromBackendCwd([
    "agent-orchestrator",
    "agent_orchestrator",
    "ao",
  ]);
}

function resolveForgePackRootFromBackendCwd(
  packName: string,
  additionalCandidates: string[] = [],
) {
  return resolveForgePackRootFromCandidatesFromBackendCwd([
    packName,
    ...additionalCandidates
      .map((candidate) => path.basename(candidate))
      .filter(Boolean),
  ]);
}

export function resolveSuperpowersRootFromBackendCwd() {
  return resolveForgePackRootFromBackendCwd("superpowers");
}

export function resolveDesignPhilosophySkillRootFromBackendCwd() {
  return resolveForgePackRootFromBackendCwd("software-design-philosophy-skill");
}

export function resolveSkillsManagerRootFromBackendCwd() {
  return resolveForgePackRootFromBackendCwd("skills-manager");
}

export function resolveImpeccableRootFromBackendCwd() {
  return resolveForgePackRootFromBackendCwd("impeccable");
}

export function resolveCeltrixRootFromBackendCwd() {
  return resolveForgePackRootFromBackendCwd("celtrix", [
    path.join(getDirectiveForgeSourcePacksRootFromBackendCwd(), "Celtrix"),
  ]);
}
