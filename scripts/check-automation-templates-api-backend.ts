import assert from "node:assert/strict";
import path from "node:path";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3217,
      tempPrefix: "mission-control-automation-templates-api-",
      sqliteFilename: "automation-templates-api.sqlite",
      setup: (tempDir) => ({ OPENCLAW_WORKSPACE_ROOT: path.join(tempDir, "workspace") }),
    },
    async (ctx) => {
      const templatesRoute = await import("../src/app/api/automation/templates/route.ts");
      const { GET: listTemplates, POST: createTemplate } = templatesRoute;

      const initialListResponse = await listTemplates(
        new Request("http://localhost/api/automation/templates?projectId=mission-control", {
          method: "GET",
        }),
      );
      assert.equal(initialListResponse.status, 200, "expected initial list status 200");
      const initialListJson = (await initialListResponse.json()) as {
        templates?: Array<Record<string, unknown>>;
      };
      assert.ok(Array.isArray(initialListJson.templates), "expected templates array");
      assert.equal(initialListJson.templates?.length || 0, 0, "expected empty initial templates list");

      const createResponse = await createTemplate(
        new Request("http://localhost/api/automation/templates?projectId=mission-control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "  Backend Templates Check  ",
            prompt: "Validate list and create route migration with verification output.",
            executor: "n8n",
            executionEnv: "local",
            status: "active",
            area: "  Runtime Reliability  ",
            webhookPath: "",
            topics: ["Ops.Health", "Runtime/reliability", "ops health"],
          }),
        }),
      );
      assert.equal(createResponse.status, 200, "expected create status 200");
      const createJson = (await createResponse.json()) as {
        msg?: string;
        template?: {
          id?: string;
          name?: string;
          executor?: string;
          executionEnv?: string;
          area?: string | null;
          webhookPath?: string | null;
          topics?: string[];
        };
      };
      assert.equal(createJson.msg, "Automation template created.");
      const templateId = String(createJson.template?.id || "").trim();
      assert.ok(templateId, "expected template id");
      assert.equal(createJson.template?.name, "Backend Templates Check");
      assert.equal(createJson.template?.executor, "n8n");
      assert.equal(createJson.template?.executionEnv, "local");
      assert.equal(createJson.template?.area, "runtime reliability");
      assert.equal(
        createJson.template?.webhookPath,
        "/webhook/mission-control/openclaw-router",
        "expected default n8n webhook path",
      );
      assert.deepEqual(
        createJson.template?.topics || [],
        ["ops health", "runtime reliability"],
        "expected normalized unique topics",
      );

      const finalListResponse = await listTemplates(
        new Request("http://localhost/api/automation/templates?projectId=mission-control", {
          method: "GET",
        }),
      );
      assert.equal(finalListResponse.status, 200, "expected final list status 200");
      const finalListJson = (await finalListResponse.json()) as {
        templates?: Array<{ id?: string }>;
      };
      const found = Array.isArray(finalListJson.templates)
        ? finalListJson.templates.some((row) => row.id === templateId)
        : false;
      assert.ok(found, "expected created template in list");

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            templateId,
            initialCount: initialListJson.templates?.length || 0,
            finalCount: finalListJson.templates?.length || 0,
          },
          null,
          2,
        )}\n`,
      );
    },
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
