import fs from "node:fs";
import path from "node:path";

type StandaloneSurfaceInventory = {
  decision: {
    packageName: string;
    releaseMode: string;
    runtimeHost: string;
  };
  packageSurface: {
    activeExportKeys: string[];
  };
  entries: Array<{
    id: string;
    path: string;
    kind: string;
  }>;
};

function unique(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const inventoryPath = path.resolve(directiveRoot, "STANDALONE_SURFACE.json");
  const readmePath = path.resolve(directiveRoot, "README.md");
  const publishReadinessPath = path.resolve(directiveRoot, "PUBLISH_READINESS.md");
  const packageManifestPath = path.resolve(directiveRoot, "package.json");
  const rootIndexPath = path.resolve(directiveRoot, "index.ts");

  const issues: string[] = [];

  if (!fs.existsSync(inventoryPath)) issues.push("missing standalone surface inventory");
  if (!fs.existsSync(packageManifestPath)) issues.push("missing Directive Workspace root package.json");
  if (!fs.existsSync(rootIndexPath)) issues.push("missing Directive Workspace root index.ts");
  if (!fs.existsSync(readmePath)) issues.push("missing Directive Workspace README");
  if (!fs.existsSync(publishReadinessPath)) issues.push("missing Directive Workspace publish readiness doc");

  if (issues.length > 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, issues }, null, 2)}\n`);
    process.exit(1);
  }

  const inventory = JSON.parse(
    fs.readFileSync(inventoryPath, "utf8"),
  ) as StandaloneSurfaceInventory;
  const packageManifest = JSON.parse(
    fs.readFileSync(packageManifestPath, "utf8"),
  ) as {
    name?: string;
    private?: boolean;
    type?: string;
    version?: string;
    exports?: Record<string, string>;
  };
  const rootIndex = fs.readFileSync(rootIndexPath, "utf8");
  const readme = fs.readFileSync(readmePath, "utf8");
  const publishReadiness = fs.readFileSync(publishReadinessPath, "utf8");

  const entryChecks = inventory.entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    exists: fs.existsSync(path.resolve(directiveRoot, entry.path)),
  }));
  const activeExportKeys = unique(Object.keys(packageManifest.exports || {}));
  const expectedExportKeys = unique(inventory.packageSurface.activeExportKeys);

  const checks = {
    packageNameCanonical: packageManifest.name === inventory.decision.packageName,
    packagePrivate: packageManifest.private === true,
    packageTypeModule: packageManifest.type === "module",
    placeholderVersionPresent: packageManifest.version === "0.0.0-private",
    releaseModeReferenceApiHostLaneReadyForShareableLocalUse:
      inventory.decision.releaseMode
      === "reference_api_host_lane_ready_for_shareable_local_use",
    runtimeHostMissionControl: inventory.decision.runtimeHost === "mission-control",
    entriesPresent: entryChecks.every((entry) => entry.exists),
    exportKeysMatchInventory:
      JSON.stringify(activeExportKeys) === JSON.stringify(expectedExportKeys),
    rootIndexExportsStandaloneNamespaces:
      rootIndex.includes('export * as engine from "./engine/index"')
      && rootIndex.includes('export * as integrationKit from "./hosts/integration-kit/index"')
      && rootIndex.includes('export * as standaloneHost from "./hosts/standalone-host/index"')
      && rootIndex.includes('export * as frontend from "./hosts/web-host/index"')
      && rootIndex.includes('export * as discovery from "./shared/lib/discovery/index"')
      && rootIndex.includes('export * as architecture from "./shared/lib/architecture/index"')
      && rootIndex.includes('from "./forge/core/v0"'),
    readmeMentionsPackageSurface:
      readme.includes("Package-Ready Standalone Surface")
      && readme.includes("@directive-workspace/product")
      && readme.includes("@directive-workspace/product/engine")
      && readme.includes("DirectiveEngine")
      && readme.includes("DirectiveEngineLaneSet")
      && readme.includes("Directive Workspace uses this hierarchy")
      && readme.includes("the three main operating lanes of the Engine")
      && readme.includes("standalone filesystem reference host")
      && readme.includes("minimal product-owned standalone frontend")
      && readme.includes("bounded HTTP API")
      && readme.includes("config-driven boot")
      && readme.includes("runtime status/access logging")
      && readme.includes("shareable local host surface")
      && readme.includes("not yet the broader host/runtime replacement"),
    publishReadinessMentionsPackageSurface:
      publishReadiness.includes("package-ready module surface")
      && publishReadiness.includes("@directive-workspace/product")
      && publishReadiness.includes("initial canonical engine surface")
      && publishReadiness.includes("Engine-owned Discovery / Forge / Architecture lane set")
      && publishReadiness.includes("standalone host for shareable GitHub/local usage")
      && publishReadiness.includes("minimal product-owned standalone frontend")
      && publishReadiness.includes("bounded HTTP API")
      && publishReadiness.includes("config-driven standalone runtime profile")
      && publishReadiness.includes("broader standalone host surface"),
  };

  const ok = Object.values(checks).every(Boolean);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        inventoryPath,
        checks,
        details: {
          entryChecks,
          activeExportKeys,
          expectedExportKeys,
        },
        issues,
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
