import assert from "node:assert/strict";
import path from "node:path";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3218,
      tempPrefix: "mission-control-automation-template-runs-api-",
      sqliteFilename: "automation-template-runs-api.sqlite",
      setup: (tempDir) => ({ OPENCLAW_WORKSPACE_ROOT: path.join(tempDir, "workspace") }),
    },
    async (ctx) => {
      const templatesRoute = await import("../src/app/api/automation/templates/route.ts");
      const checkRoute = await import(
        "../src/app/api/automation/templates/[id]/check/route.ts"
      );
      const runsRoute = await import(
        "../src/app/api/automation/templates/[id]/runs/route.ts"
      );

      const { POST: createTemplate } = templatesRoute;
      const { POST: checkTemplate } = checkRoute;
      const { GET: listTemplateRuns } = runsRoute;

      const createResponse = await createTemplate(
        new Request("http://localhost/api/automation/templates?projectId=mission-control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Template Runs Backend Check",
            prompt: "Do it",
            executor: "openclaw",
            executionEnv: "worktree",
            topics: ["automation", "runs"],
          }),
        }),
      );
      assert.equal(createResponse.status, 200, "expected create template status 200");
      const createJson = (await createResponse.json()) as {
        template?: { id?: string };
      };
      const templateId = String(createJson.template?.id || "").trim();
      assert.ok(templateId, "expected template id");

      const checkResponse = await checkTemplate(
        new Request(
          `http://localhost/api/automation/templates/${templateId}/check?projectId=mission-control`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          },
        ),
        { params: Promise.resolve({ id: templateId }) },
      );
      assert.equal(checkResponse.status, 200, "expected check status 200");

      const runsResponse = await listTemplateRuns(
        new Request(
          `http://localhost/api/automation/templates/${templateId}/runs?projectId=mission-control`,
          {
            method: "GET",
          },
        ),
        { params: Promise.resolve({ id: templateId }) },
      );
      assert.equal(runsResponse.status, 200, "expected list runs status 200");
      const runsJson = (await runsResponse.json()) as {
        success?: boolean;
        templateId?: string;
        runs?: Array<{
          mode?: string;
          status?: string;
          request?: Record<string, unknown>;
          response?: Record<string, unknown>;
        }>;
      };
      assert.equal(runsJson.success, true, "expected success true");
      assert.equal(runsJson.templateId, templateId, "expected matching templateId");
      assert.ok(Array.isArray(runsJson.runs), "expected runs array");
      const latest = Array.isArray(runsJson.runs) ? runsJson.runs[0] : null;
      assert.ok(latest, "expected latest run row");
      assert.equal(latest?.mode, "evaluate", "expected evaluate mode from check run");
      assert.ok(typeof latest?.request === "object", "expected request payload object");
      assert.ok(typeof latest?.response === "object", "expected response payload object");

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            templateId,
            runsCount: runsJson.runs?.length || 0,
            latestMode: latest?.mode || null,
            latestStatus: latest?.status || null,
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
