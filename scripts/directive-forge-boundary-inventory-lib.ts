import fs from "node:fs";
import path from "node:path";

export type ForgeBoundaryMirrorGroup = "forge_core" | "shared_lib";

export type ForgeBoundaryMirrorEntry = {
  id: string;
  group: ForgeBoundaryMirrorGroup;
  canonicalPath: string;
  hostMirrorPath: string | null;
  compareBodyOnly: boolean;
  cutoverDecision: string;
};

export type ForgeBoundaryHostOnlyEntry = {
  id: string;
  path: string;
  kind: string;
  decision: string;
};

export type ForgeBoundaryInventory = {
  status: string;
  updatedAt: string;
  decision: {
    productOwner: string;
    productOwnerReason: string;
    packageImportCutover: string;
    packageImportReason: string;
    hostIntegrationModel: string;
    hostIntegrationModelReason: string;
    runtimeHost: string;
    runtimeHostReason: string;
  };
  packageSurface: {
    activeExportKeys: string[];
    deferredExportKeys: string[];
  };
  mirrorEntries: ForgeBoundaryMirrorEntry[];
  hostOnlyEntries: ForgeBoundaryHostOnlyEntry[];
};

export const missionControlRoot = process.cwd();
export const directiveWorkspaceRoot = path.resolve(
  missionControlRoot,
  "..",
  "directive-workspace",
);
export const forgeBoundaryInventoryPath = path.resolve(
  directiveWorkspaceRoot,
  "forge",
  "BOUNDARY_INVENTORY.json",
);

export function loadForgeBoundaryInventory(): ForgeBoundaryInventory {
  return JSON.parse(
    fs.readFileSync(forgeBoundaryInventoryPath, "utf8"),
  ) as ForgeBoundaryInventory;
}

export function resolveCanonicalPath(relativePath: string) {
  return path.resolve(directiveWorkspaceRoot, relativePath);
}

export function resolveHostPath(relativePath: string) {
  return path.resolve(missionControlRoot, relativePath);
}

export function listTsFiles(dirPath: string) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .sort();
}
