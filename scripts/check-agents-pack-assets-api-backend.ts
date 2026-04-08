import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { withBackendTestEnv } from "./backend-test-helper.ts";

withBackendTestEnv(
  {
    port: 3220,
    tempPrefix: "mission-control-agents-pack-assets-api-",
    sqliteFilename: "agents-pack-assets-api.sqlite",
    setup: (tempDir) => {
      const workspaceRoot = path.join(tempDir, "workspace-root");
      const assetDir = path.join(workspaceRoot, "asset-dir");
      mkdirSync(workspaceRoot, { recursive: true });
      mkdirSync(assetDir, { recursive: true });
      writeFileSync(path.join(workspaceRoot, "asset-file.txt"), "pack-asset-preview-file-content\nline2\n");
      writeFileSync(path.join(assetDir, "entry-a.md"), "# entry-a\n");
      writeFileSync(path.join(assetDir, "entry-b.md"), "# entry-b\n");
      writeFileSync(path.join(tempDir, "outside.txt"), "outside");
      return { OPENCLAW_WORKSPACE_ROOT: workspaceRoot };
    },
  },
  async ({ tempDir }) => {
    const workspaceRoot = path.join(tempDir, "workspace-root");
    const assetFile = path.join(workspaceRoot, "asset-file.txt");
    const assetDir = path.join(workspaceRoot, "asset-dir");
    const outsideFile = path.join(tempDir, "outside.txt");

    const agentsRoute = await import("../src/app/api/agents/route.ts");
    const packAssetsRoute = await import("../src/app/api/agents/[id]/pack-assets/route.ts");

    const createResponse = await agentsRoute.POST(
      new Request("http://localhost/api/agents?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Pack Assets Agent",
          role: "builder",
          backend: "openclaw",
          executor: "openclaw",
          packAssets: [
            { label: "asset-file", path: assetFile, kind: "file" },
            { label: "asset-dir", path: assetDir, kind: "directory" },
            { label: "outside", path: outsideFile, kind: "file" },
          ],
        }),
      }),
    );
    assert.equal(createResponse.status, 200, "expected agent create route to return 200");
    const createJson = (await createResponse.json()) as { agent?: { id?: string } };
    const agentId = String(createJson.agent?.id || "");
    assert.ok(agentId, "expected created agent id");

    const response = await packAssetsRoute.GET(
      new Request(`http://localhost/api/agents/${agentId}/pack-assets?projectId=mission-control`, { method: "GET" }),
      { params: Promise.resolve({ id: agentId }) },
    );
    assert.equal(response.status, 200, "expected pack-assets route to return 200");
    const json = (await response.json()) as { assets?: Array<{ label?: string; preview?: string }> };
    const assets = Array.isArray(json.assets) ? json.assets : [];
    assert.ok(assets.length >= 3, "expected 3 pack asset previews");
    const filePreview = assets.find((asset) => asset.label === "asset-file")?.preview || "";
    const dirPreview = assets.find((asset) => asset.label === "asset-dir")?.preview || "";
    const outsidePreview = assets.find((asset) => asset.label === "outside")?.preview || "";
    assert.match(filePreview, /pack-asset-preview-file-content/, "expected file preview content");
    assert.match(dirPreview, /entry-a\.md/, "expected directory preview list");
    assert.match(outsidePreview, /outside workspace/i, "expected outside workspace warning");

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          assetCount: assets.length,
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
