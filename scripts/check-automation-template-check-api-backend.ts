import assert from "node:assert/strict";
import path from "node:path";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3216,
      tempPrefix: "mission-control-automation-template-check-api-",
      sqliteFilename: "automation-template-check-api.sqlite",
      setup: (tempDir) => ({ OPENCLAW_WORKSPACE_ROOT: path.join(tempDir, "workspace") }),
    },
    async (ctx) => {
      const templatesRoute = await import("../src/app/api/automation/templates/route.ts");
      const checkRoute = await import(
        "../src/app/api/automation/templates/[id]/check/route.ts"
      );
      const runsRoute = await import("../src/app/api/automation/templates/[id]/runs/route.ts");

      const { POST: createTemplate } = templatesRoute;
      const { POST: checkTemplate } = checkRoute;
      const { GET: listTemplateRuns } = runsRoute;

      const createResponse = await createTemplate(
        new Request("http://localhost/api/automation/templates?projectId=mission-control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Check backend template",
            prompt: "Do it",
            executor: "n8n",
            executionEnv: "worktree",
            webhookPath: "",
            topics: [],
          }),
        }),
      );
      assert.equal(createResponse.status, 200, "expected create template status 200");
      const createJson = (await createResponse.json()) as {
        template?: { id?: string };
      };
      const templateId = String(createJson.template?.id || "").trim();
      assert.ok(templateId, "expected template id from create");

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
      const checkJson = (await checkResponse.json()) as {
        msg?: string;
        template?: { lastRunStatus?: string | null };
        evaluation?: {
          score?: number;
          summary?: string;
          recommendedStatus?: "success" | "warning" | "error";
          findings?: Array<{ severity?: string; title?: string; detail?: string }>;
        };
      };
      assert.equal(checkJson.msg, "Template check completed.");
      assert.ok(
        checkJson.evaluation && typeof checkJson.evaluation === "object",
        "expected evaluation payload",
      );
      assert.ok(
        typeof checkJson.evaluation?.score === "number",
        "expected evaluation score number",
      );
      assert.ok(
        typeof checkJson.evaluation?.summary === "string",
        "expected evaluation summary string",
      );
      assert.ok(
        ["success", "warning", "error"].includes(
          String(checkJson.evaluation?.recommendedStatus || ""),
        ),
        "expected valid recommendedStatus",
      );
      assert.equal(
        String(checkJson.template?.lastRunStatus || ""),
        String(checkJson.evaluation?.recommendedStatus || ""),
        "expected template lastRunStatus to match evaluation status",
      );
      assert.ok(
        Array.isArray(checkJson.evaluation?.findings),
        "expected findings array",
      );

      const runsResponse = await listTemplateRuns(
        new Request(
          `http://localhost/api/automation/templates/${templateId}/runs?projectId=mission-control`,
          { method: "GET" },
        ),
        { params: Promise.resolve({ id: templateId }) },
      );
      assert.equal(runsResponse.status, 200, "expected runs status 200");
      const runsJson = (await runsResponse.json()) as {
        runs?: Array<{ mode?: string; status?: string }>;
      };
      const latestRun = Array.isArray(runsJson.runs) ? runsJson.runs[0] : null;
      assert.equal(latestRun?.mode, "evaluate", "expected latest run mode evaluate");
      assert.equal(
        latestRun?.status,
        checkJson.evaluation?.recommendedStatus,
        "expected latest run status to match evaluation recommendation",
      );

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            templateId,
            recommendedStatus: checkJson.evaluation?.recommendedStatus || null,
            findings: Array.isArray(checkJson.evaluation?.findings)
              ? checkJson.evaluation?.findings.length
              : 0,
            latestRunMode: latestRun?.mode || null,
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
