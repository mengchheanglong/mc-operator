import assert from "node:assert/strict";
import path from "node:path";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3219,
      tempPrefix: "mission-control-automation-template-entry-api-",
      sqliteFilename: "automation-template-entry-api.sqlite",
      setup: (tempDir) => ({ OPENCLAW_WORKSPACE_ROOT: path.join(tempDir, "workspace") }),
    },
    async (ctx) => {
      const templatesRoute = await import("../src/app/api/automation/templates/route.ts");
      const templateRoute = await import(
        "../src/app/api/automation/templates/[id]/route.ts"
      );

      const { GET: listTemplates, POST: createTemplate } = templatesRoute;
      const { PUT: updateTemplate, DELETE: deleteTemplate } = templateRoute;

      const createResponse = await createTemplate(
        new Request("http://localhost/api/automation/templates?projectId=mission-control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Template Entry Backend Check",
            prompt: "Validate update/delete migration path.",
            executor: "openclaw",
            executionEnv: "worktree",
            status: "active",
            area: "Automation",
            topics: ["automation", "entry"],
          }),
        }),
      );
      assert.equal(createResponse.status, 200, "expected create template status 200");
      const createJson = (await createResponse.json()) as {
        template?: { id?: string };
      };
      const templateId = String(createJson.template?.id || "").trim();
      assert.ok(templateId, "expected template id");

      const updateResponse = await updateTemplate(
        new Request(
          `http://localhost/api/automation/templates/${templateId}?projectId=mission-control`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "  Updated Entry Check  ",
              prompt: "Updated prompt with verify and summary output for migration check.",
              executor: "n8n",
              executionEnv: "local",
              status: "paused",
              area: " Runtime Reliability ",
              topics: ["runtime/reliability", "ops.health", "ops health"],
            }),
          },
        ),
        { params: Promise.resolve({ id: templateId }) },
      );
      assert.equal(updateResponse.status, 200, "expected update status 200");
      const updateJson = (await updateResponse.json()) as {
        msg?: string;
        template?: {
          id?: string;
          name?: string;
          executor?: string;
          executionEnv?: string;
          status?: string;
          area?: string | null;
          webhookPath?: string | null;
          topics?: string[];
        };
      };
      assert.equal(updateJson.msg, "Automation template updated.");
      assert.equal(updateJson.template?.id, templateId);
      assert.equal(updateJson.template?.name, "Updated Entry Check");
      assert.equal(updateJson.template?.executor, "n8n");
      assert.equal(updateJson.template?.executionEnv, "local");
      assert.equal(updateJson.template?.status, "paused");
      assert.equal(updateJson.template?.area, "runtime reliability");
      assert.equal(
        updateJson.template?.webhookPath,
        "/webhook/mission-control/openclaw-router",
        "expected default n8n webhook path on update",
      );
      assert.deepEqual(
        updateJson.template?.topics || [],
        ["runtime reliability", "ops health"],
        "expected normalized unique topics",
      );

      const deleteResponse = await deleteTemplate(
        new Request(
          `http://localhost/api/automation/templates/${templateId}?projectId=mission-control`,
          { method: "DELETE" },
        ),
        { params: Promise.resolve({ id: templateId }) },
      );
      assert.equal(deleteResponse.status, 200, "expected delete status 200");
      const deleteJson = (await deleteResponse.json()) as { msg?: string };
      assert.equal(deleteJson.msg, "Automation template deleted.");

      const listResponse = await listTemplates(
        new Request("http://localhost/api/automation/templates?projectId=mission-control", {
          method: "GET",
        }),
      );
      assert.equal(listResponse.status, 200, "expected list status 200");
      const listJson = (await listResponse.json()) as {
        templates?: Array<{ id?: string }>;
      };
      const found = Array.isArray(listJson.templates)
        ? listJson.templates.some((row) => row.id === templateId)
        : false;
      assert.equal(found, false, "expected template removed from list after delete");

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            templateId,
            updatedStatus: updateJson.template?.status || null,
            remainingTemplates: listJson.templates?.length || 0,
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
