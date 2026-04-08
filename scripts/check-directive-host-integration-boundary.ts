import fs from "node:fs";
import path from "node:path";
import {
  directiveWorkspaceRoot,
  loadForgeBoundaryInventory,
} from "./directive-forge-boundary-inventory-lib";

const contractPath = path.resolve(
  directiveWorkspaceRoot,
  "shared",
  "contracts",
  "host-integration-boundary.md",
);
const readmePath = path.resolve(directiveWorkspaceRoot, "README.md");
const doctrinePath = path.resolve(
  directiveWorkspaceRoot,
  "knowledge",
  "doctrine.md",
);
const ownershipPath = path.resolve(directiveWorkspaceRoot, "OWNERSHIP.md");
const hostNotesPath = path.resolve(
  directiveWorkspaceRoot,
  "hosts",
  "mission-control.md",
);

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function includesAll(content: string, patterns: string[]) {
  return patterns.every((pattern) => content.includes(pattern));
}

function main() {
  const inventory = loadForgeBoundaryInventory();
  const readme = readText(readmePath);
  const doctrine = readText(doctrinePath);
  const ownership = readText(ownershipPath);
  const hostNotes = readText(hostNotesPath);
  const contract = readText(contractPath);

  const checks = {
    contractExists: fs.existsSync(contractPath),
    readmeStatesStandaloneProduct: includesAll(readme, [
      "Directive Workspace is the **product**.",
      "standalone product",
      "Mission Control is a **host**.",
    ]),
    doctrineStatesHostNotDefinition: includesAll(doctrine, [
      "active runtime host",
      "does not own Forge as a product concept",
      "not the canonical definition of Directive Workspace",
    ]),
    ownershipStatesHostIntegrationRule: includesAll(ownership, [
      "standalone and host-agnostic by design",
      "integrates Directive Workspace but does not define it",
      "Directive Workspace canonical asset first",
    ]),
    hostNotesStateAdapterModel: includesAll(hostNotes, [
      "Directive Workspace remains the standalone product.",
      "thin host adapters over canonical Directive Workspace assets",
      "Mission Control is still only a host, not the product definition",
    ]),
    contractStatesCanonicalBoundary: includesAll(contract, [
      "Directive Workspace is a **standalone product**",
      "host-agnostic",
      "Directive Workspace canonical asset first -> host adapter second",
      "hosts or connected layers that consume, enforce, or expose Directive Workspace rather than define it",
    ]),
    inventoryProductOwner: inventory.decision.productOwner === "directive-workspace",
    inventoryHostModel: inventory.decision.hostIntegrationModel === "adapter_host",
    inventoryRuntimeHost: inventory.decision.runtimeHost === "mission-control",
    mirrorEntriesStayInHostLib: inventory.mirrorEntries.every((entry) =>
      entry.hostMirrorPath === null
      || entry.hostMirrorPath.startsWith("src/lib/directive-workspace/"),
    ),
    essentialHostOnlyEntriesPresent: [
      "host-api-directive-workspace",
      "host-ui-directive-workspace",
      "host-service-directive-workspace",
      "host-service-directive-workspace-read",
    ].every((id) => inventory.hostOnlyEntries.some((entry) => entry.id === id)),
  };

  const ok = Object.values(checks).every(Boolean);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        checks,
        paths: {
          contractPath,
          readmePath,
          doctrinePath,
          ownershipPath,
          hostNotesPath,
        },
        inventoryDecision: inventory.decision,
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
