import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { withBackendTestEnv } from "./backend-test-helper.ts";

withBackendTestEnv(
  {
    port: 3219,
    tempPrefix: "mission-control-agents-import-packs-api-",
    sqliteFilename: "agents-import-packs-api.sqlite",
    setup: (tempDir) => {
      const workspaceRoot = path.join(tempDir, "workspace-root");
      const forgeRoot = path.join(workspaceRoot, "directive-workspace", "forge");
      const sourcePacksRoot = path.join(forgeRoot, "source-packs");

      const agencyAgentsRoot = path.join(sourcePacksRoot, "agency-agents");
      const superpowersRoot = path.join(sourcePacksRoot, "superpowers");
      const skillsManagerRoot = path.join(sourcePacksRoot, "skills-manager");
      const impeccableRoot = path.join(sourcePacksRoot, "impeccable");

      mkdirSync(path.join(agencyAgentsRoot, "engineering"), { recursive: true });
      mkdirSync(superpowersRoot, { recursive: true });
      mkdirSync(path.join(skillsManagerRoot, "scripts"), { recursive: true });
      mkdirSync(path.join(skillsManagerRoot, "src"), { recursive: true });
      mkdirSync(path.join(skillsManagerRoot, "assets"), { recursive: true });
      mkdirSync(impeccableRoot, { recursive: true });

      writeFileSync(path.join(agencyAgentsRoot, "README.md"), "# agency-agents\n");
      writeFileSync(path.join(agencyAgentsRoot, "SOURCE_PACK_READY.md"), "# agency-agents ready\n");
      writeFileSync(path.join(agencyAgentsRoot, "engineering", "README.md"), "# engineering\n");
      writeFileSync(path.join(superpowersRoot, "README.md"), "# superpowers\n");
      writeFileSync(path.join(skillsManagerRoot, "README.md"), "# skills-manager\n");
      writeFileSync(path.join(skillsManagerRoot, "scripts", "README.md"), "# scripts\n");
      writeFileSync(path.join(skillsManagerRoot, "src", "README.md"), "# src\n");
      writeFileSync(path.join(skillsManagerRoot, "assets", "README.md"), "# assets\n");
      writeFileSync(path.join(impeccableRoot, "README.md"), "# impeccable\n");

      const forgeCatalogPath = path.join(sourcePacksRoot, "CATALOG.json");
      const forgeImportPolicyPath = path.join(forgeRoot, "IMPORT_SOURCE_POLICY.json");

      writeFileSync(
        forgeCatalogPath,
        `${JSON.stringify(
          {
            status: "active",
            updatedAt: "2026-03-21",
            policy: {
              readyMarkerMeaning: "cutover_complete",
              runtimeActivationRule:
                "A source pack is runtime-live only when it is classified as live_runtime in this catalog and contains SOURCE_PACK_READY.md.",
              nonLiveRule:
                "follow_up_only and reference_only packs may remain cutover-complete, but they must not be treated as active runtime truth.",
            },
            packs: [
              {
                id: "agency-agents",
                label: "agency-agents",
                classification: "live_runtime",
                activationMode: "resolver",
                hostConsumers: [],
                note: "test entry",
              },
              {
                id: "superpowers",
                label: "superpowers",
                classification: "follow_up_only",
                activationMode: "manual_follow_up",
                hostConsumers: [],
                note: "test entry",
              },
              {
                id: "skills-manager",
                label: "skills-manager",
                classification: "live_runtime",
                activationMode: "agent_pack_import_lane",
                hostConsumers: [],
                note: "test entry",
              },
              {
                id: "impeccable",
                label: "impeccable",
                classification: "reference_only",
                activationMode: "reference_only",
                hostConsumers: [],
                note: "test entry",
              },
            ],
          },
          null,
          2,
        )}\n`,
      );

      writeFileSync(
        forgeImportPolicyPath,
        `${JSON.stringify(
          {
            status: "active",
            updatedAt: "2026-03-21",
            policy: {
              defaultImportRule:
                "Only sources declared as default_import may load when the import request omits `sources`.",
              explicitImportRule:
                "Explicit import requests may include only default_import and explicit_import_only sources.",
              blockedRule:
                "Blocked sources must return `source_blocked` and reference-only packs must never enter the import lane.",
            },
            sources: [
              {
                id: "agency-agents",
                availability: "default_import",
                requiredClassification: "live_runtime",
                requiredActivationMode: "resolver",
                note: "test policy entry",
              },
              {
                id: "superpowers",
                availability: "explicit_import_only",
                requiredClassification: "follow_up_only",
                requiredActivationMode: "manual_follow_up",
                note: "test policy entry",
              },
              {
                id: "skills-manager",
                availability: "default_import",
                requiredClassification: "live_runtime",
                requiredActivationMode: "agent_pack_import_lane",
                note: "test policy entry",
              },
              {
                id: "impeccable",
                availability: "blocked",
                requiredClassification: "reference_only",
                requiredActivationMode: "reference_only",
                note: "test policy entry",
              },
            ],
          },
          null,
          2,
        )}\n`,
      );

      return { OPENCLAW_WORKSPACE_ROOT: workspaceRoot };
    },
  },
  async () => {
    const importRoute = await import("../src/app/api/agents/import-packs/route.ts");

    const missingSourcesResponse = await importRoute.POST(
      new Request("http://localhost/api/agents/import-packs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: [] }),
      }),
    );
    assert.equal(missingSourcesResponse.status, 400, "expected missing sources to return 400");
    const missingSourcesJson = (await missingSourcesResponse.json()) as { reason?: string };
    assert.equal(missingSourcesJson.reason, "missing_sources", "expected missing sources reason");

    const defaultImportResponse = await importRoute.POST(
      new Request("http://localhost/api/agents/import-packs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    assert.equal(defaultImportResponse.status, 200, "expected default import packs to return 200");
    const defaultImportJson = (await defaultImportResponse.json()) as {
      agents?: Array<{ sourcePack?: string }>;
      updatedCount?: number;
    };
    assert.ok(Array.isArray(defaultImportJson.agents), "expected imported agents array");
    assert.ok(
      (defaultImportJson.agents || []).length >= 2,
      "expected default imports from two pack sources",
    );
    const defaultSourcePacks = new Set(
      (defaultImportJson.agents || []).map((agent) => agent.sourcePack || ""),
    );
    assert.deepEqual(
      [...defaultSourcePacks].sort(),
      ["agency-agents", "skills-manager"],
      "expected omitted sources to use only default_import policy entries",
    );

    const explicitImportResponse = await importRoute.POST(
      new Request("http://localhost/api/agents/import-packs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: ["superpowers"] }),
      }),
    );
    assert.equal(explicitImportResponse.status, 200, "expected explicit import packs to return 200");
    const explicitImportJson = (await explicitImportResponse.json()) as {
      agents?: Array<{ sourcePack?: string }>;
      updatedCount?: number;
    };
    assert.ok(Array.isArray(explicitImportJson.agents), "expected imported agents array");
    assert.ok((explicitImportJson.agents || []).length >= 1, "expected at least one imported agent");
    assert.equal(
      explicitImportJson.agents?.[0]?.sourcePack,
      "superpowers",
      "expected imported source pack",
    );

    const blockedImportResponse = await importRoute.POST(
      new Request("http://localhost/api/agents/import-packs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: ["impeccable"] }),
      }),
    );
    assert.equal(blockedImportResponse.status, 409, "expected blocked source import to return 409");
    const blockedImportJson = (await blockedImportResponse.json()) as { reason?: string };
    assert.equal(blockedImportJson.reason, "source_blocked", "expected blocked source reason");

    const syncResponse = await importRoute.POST(
      new Request("http://localhost/api/agents/import-packs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: ["superpowers"], syncExisting: true }),
      }),
    );
    assert.equal(syncResponse.status, 200, "expected sync import packs to return 200");
    const syncJson = (await syncResponse.json()) as { updatedCount?: number };
    assert.ok((syncJson.updatedCount || 0) >= 1, "expected sync import to update existing agents");

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          defaultImportedCount: (defaultImportJson.agents || []).length,
          explicitImportedCount: (explicitImportJson.agents || []).length,
          updatedCount: syncJson.updatedCount || 0,
        },
        null,
        2,
      )}\n`,
    );
  },
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
