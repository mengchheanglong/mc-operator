import fs from "node:fs";
import path from "node:path";
import {
  directiveWorkspaceRoot,
  forgeBoundaryInventoryPath,
  listTsFiles,
  loadForgeBoundaryInventory,
  missionControlRoot,
  resolveCanonicalPath,
  resolveHostPath,
} from "../lib/forge-boundary-inventory";

function unique(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function main() {
  const inventory = loadForgeBoundaryInventory();

  const mirrorChecks = inventory.mirrorEntries.map((entry) => ({
    id: entry.id,
    canonicalExists: fs.existsSync(resolveCanonicalPath(entry.canonicalPath)),
    hostMirrorExists: entry.hostMirrorPath
      ? fs.existsSync(resolveHostPath(entry.hostMirrorPath))
      : true,
  }));

  const hostOnlyChecks = inventory.hostOnlyEntries.map((entry) => ({
    id: entry.id,
    exists: fs.existsSync(resolveHostPath(entry.path)),
  }));

  const actualForgeCore = listTsFiles(path.resolve(directiveWorkspaceRoot, "forge", "core"))
    .filter((name) => !name.endsWith(".d.ts"));
  const actualSharedLib = listTsFiles(path.resolve(directiveWorkspaceRoot, "shared", "lib"));
  const actualHostMirrors = listTsFiles(
    path.resolve(missionControlRoot, "src", "lib", "directive-workspace"),
  );

  const inventoryForgeCore = inventory.mirrorEntries
    .filter((entry) => entry.group === "forge_core")
    .map((entry) => path.basename(entry.canonicalPath))
    .sort();
  const inventorySharedLib = inventory.mirrorEntries
    .filter((entry) => entry.group === "shared_lib")
    .map((entry) => path.basename(entry.canonicalPath))
    .sort();
  const inventoryHostMirrors = inventory.mirrorEntries
    .filter((entry) => Boolean(entry.hostMirrorPath))
    .map((entry) => path.basename(entry.hostMirrorPath as string))
    .sort();

  const forgePackageJson = JSON.parse(
    fs.readFileSync(path.resolve(directiveWorkspaceRoot, "forge", "package.json"), "utf8"),
  ) as { exports?: Record<string, unknown> };
  const activeExportKeys = unique(Object.keys(forgePackageJson.exports || {}));
  const expectedExportKeys = unique(inventory.packageSurface.activeExportKeys);

  const checks = {
    inventoryExists: fs.existsSync(forgeBoundaryInventoryPath),
    packageImportCutoverDeferred:
      inventory.decision.packageImportCutover === "defer_direct_import",
    runtimeHostMissionControl: inventory.decision.runtimeHost === "mission-control",
    mirrorFilesPresent: mirrorChecks.every(
      (entry) => entry.canonicalExists && entry.hostMirrorExists,
    ),
    hostOnlyFilesPresent: hostOnlyChecks.every((entry) => entry.exists),
    forgeCoreAccounted:
      JSON.stringify(actualForgeCore) === JSON.stringify(inventoryForgeCore),
    sharedLibAccounted:
      JSON.stringify(actualSharedLib) === JSON.stringify(inventorySharedLib),
    hostMirrorsAccounted:
      JSON.stringify(actualHostMirrors) === JSON.stringify(inventoryHostMirrors),
    packageExportsMatchInventory:
      JSON.stringify(activeExportKeys) === JSON.stringify(expectedExportKeys),
  };

  const ok = Object.values(checks).every(Boolean);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        inventoryPath: forgeBoundaryInventoryPath,
        checks,
        details: {
          mirrorChecks,
          hostOnlyChecks,
          actualForgeCore,
          inventoryForgeCore,
          actualSharedLib,
          inventorySharedLib,
          actualHostMirrors,
          inventoryHostMirrors,
          activeExportKeys,
          expectedExportKeys,
        },
      },
      null,
      2,
    )}\n`,
  );

  if (!ok) {
    process.exit(1);
  }
}

main();
