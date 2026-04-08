import assert from "node:assert/strict";
import path from "node:path";
import { withBackendTestEnv } from "./backend-test-helper.js";

async function run() {
  await withBackendTestEnv(
    {
      port: 3215,
      tempPrefix: "mission-control-automation-template-run-api-",
      sqliteFilename: "automation-template-run-api.sqlite",
      setup: (tempDir) => ({ OPENCLAW_WORKSPACE_ROOT: path.join(tempDir, "workspace") }),
    },
    async (ctx) => {
      const templatesRoute = await import("../src/app/api/automation/templates/route.ts");
      const runRoute = await import("../src/app/api/automation/templates/[id]/run/route.ts");

      const { POST: createTemplate } = templatesRoute;
      const { POST: prepareRun } = runRoute;

      const createResponse = await createTemplate(
        new Request("http://localhost/api/automation/templates?projectId=mission-control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Run backend check",
            prompt: "Prepare bounded execution task and return payload.",
            executor: "codex",
            executionEnv: "worktree",
            topics: ["automation", "backend"],
          }),
        }),
      );
      assert.equal(createResponse.status, 200, "expected create template status 200");
      const createJson = (await createResponse.json()) as {
        template?: { id?: string };
      };
      const templateId = String(createJson.template?.id || "").trim();
      assert.ok(templateId, "expected template id from create");

      const runResponse = await prepareRun(
        new Request(
          `http://localhost/api/automation/templates/${templateId}/run?projectId=mission-control`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          },
        ),
        { params: Promise.resolve({ id: templateId }) },
      );
      assert.equal(runResponse.status, 200, "expected run status 200");
      const runJson = (await runResponse.json()) as {
        msg?: string;
        template?: { lastRunStatus?: string | null };
        run?: {
          summary?: string;
          brief?: string;
          reportId?: string;
          reportHref?: string;
          executorPayload?: Record<string, unknown>;
        };
      };
      assert.equal(runJson.msg, "Automation run prepared.");
      assert.equal(
        String(runJson.template?.lastRunStatus || ""),
        "ready",
        "expected template lastRunStatus ready",
      );
      assert.ok(String(runJson.run?.summary || "").toLowerCase().includes("execution brief prepared"));
      assert.ok(String(runJson.run?.brief || "").includes("Automation Template:"));
      assert.ok(String(runJson.run?.reportId || "").trim(), "expected reportId");
      assert.ok(String(runJson.run?.reportHref || "").trim(), "expected reportHref");
      assert.ok(
        runJson.run?.executorPayload && typeof runJson.run.executorPayload === "object",
        "expected executorPayload object",
      );

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            templateId,
            msg: runJson.msg || null,
            lastRunStatus: runJson.template?.lastRunStatus || null,
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
