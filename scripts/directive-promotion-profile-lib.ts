import fs from "node:fs";
import path from "node:path";

export type ForgePromotionProfile = {
  id: string;
  family: string;
  proofShape: string;
  contractPath: string;
  primaryHostCheckCommand: string;
  primaryHostCheckScriptPath: string;
  supportingHostCheckCommands: string[];
  nonApplicableFieldsAllowed: string[];
  notes: string;
};

export type ForgePromotionProfileCatalog = {
  status: string;
  updatedAt: string;
  policy: {
    selectorField: string;
    familyField: string;
    proofShapeField: string;
    primaryHostCheckerField: string;
    resolutionRule: string;
    proofShapeRule: string;
    hostCheckerRule: string;
    nonApplicableFieldRule: string;
  };
  profiles: ForgePromotionProfile[];
};

export const missionControlRoot = process.cwd();
export const directiveWorkspaceRoot = path.resolve(
  missionControlRoot,
  "..",
  "directive-workspace",
);
export const forgePromotionProfileCatalogPath = path.resolve(
  directiveWorkspaceRoot,
  "forge",
  "PROMOTION_PROFILES.json",
);

export function loadForgePromotionProfileCatalog(): ForgePromotionProfileCatalog {
  return JSON.parse(
    fs.readFileSync(forgePromotionProfileCatalogPath, "utf8"),
  ) as ForgePromotionProfileCatalog;
}

export function getForgePromotionProfile(profileId: string): ForgePromotionProfile {
  const catalog = loadForgePromotionProfileCatalog();
  const profile = catalog.profiles.find((entry) => entry.id === profileId);
  if (!profile) {
    throw new Error(`missing Forge promotion profile: ${profileId}`);
  }
  return profile;
}

export function resolveDirectiveWorkspacePath(relativePath: string) {
  return path.resolve(directiveWorkspaceRoot, relativePath);
}

export function resolveMissionControlPath(relativePath: string) {
  return path.resolve(missionControlRoot, relativePath);
}
