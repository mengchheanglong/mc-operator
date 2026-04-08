import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { withBackendTestEnv } from "./backend-test-helper.js";

function setupTempRepo(projectRoot: string) {
  mkdirSync(projectRoot, { recursive: true });
  try {
    execSync("git init -b main", { cwd: projectRoot, stdio: "pipe" });
  } catch {
    execSync("git init", { cwd: projectRoot, stdio: "pipe" });
    execSync("git checkout -B main", { cwd: projectRoot, stdio: "pipe" });
  }
  execSync('git config user.email "automation-tools-check@example.com"', {
    cwd: projectRoot,
    stdio: "pipe",
  });
  execSync('git config user.name "Automation Tools Check"', {
    cwd: projectRoot,
    stdio: "pipe",
  });
  writeFileSync(path.join(projectRoot, "README.md"), "# temp automation tools repo\n");
  execSync("git add README.md", { cwd: projectRoot, stdio: "pipe" });
  execSync('git commit -m "init"', { cwd: projectRoot, stdio: "pipe" });
}

async function run() {
  await withBackendTestEnv(
    {
      port: 3213,
      tempPrefix: "mission-control-automation-run-tools-api-",
      sqliteFilename: "automation-run-tools-api.sqlite",
      setup: (tempDir) => {
        const workspaceRoot = path.join(tempDir, "workspace");
        const projectRoot = path.join(workspaceRoot, "mission-control");
        setupTempRepo(projectRoot);
        return { OPENCLAW_WORKSPACE_ROOT: workspaceRoot };
      },
    },
    async (ctx) => {
      const createRoute = await import("../src/app/api/automation/runs/create/route.ts");
      const toolsRoute = await import("../src/app/api/automation/runs/[id]/tools/route.ts");
      const toolingAuditRoute = await import(
        "../src/app/api/automation/runs/[id]/tooling-audit/route.ts"
      );

      const { POST: createRun } = createRoute;
      const { POST: runTools } = toolsRoute;
      const { POST: runToolingAudit } = toolingAuditRoute;

      const createResponse = await createRun(
        new Request("http://localhost/api/automation/runs/create?projectId=mission-control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            branch: "main",
            metadata: { purpose: "automation-run-tools-backend-check" },
          }),
        }),
      );
      assert.equal(createResponse.status, 200, "expected create run status 200");
      const createJson = (await createResponse.json()) as { run?: { id?: string } };
      const runId = String(createJson.run?.id || "").trim();
      assert.ok(runId, "expected run id from create");

      const toolsResponse = await runTools(
        new Request(`http://localhost/api/automation/runs/${runId}/tools?projectId=mission-control`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toolId: "desloppify-prototype",
            minChars: 200,
            content: "short text",
            timeoutMs: 25_000,
          }),
        }),
        { params: Promise.resolve({ id: runId }) },
      );
      assert.equal(toolsResponse.status, 200, "expected tools status 200");
      const toolsJson = (await toolsResponse.json()) as {
        canonicalToolId?: string;
        run?: { status?: string; toolId?: string };
      };
      assert.equal(
        toolsJson.canonicalToolId,
        "desloppify-prototype",
        "expected canonicalToolId for tools",
      );
      assert.equal(toolsJson.run?.status, "success", "expected tools run status success");

      const toolingAuditResponse = await runToolingAudit(
        new Request(
          `http://localhost/api/automation/runs/${runId}/tooling-audit?projectId=mission-control`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              minChars: 200,
              content: "short text",
              timeoutMs: 25_000,
            }),
          },
        ),
        { params: Promise.resolve({ id: runId }) },
      );
      assert.equal(toolingAuditResponse.status, 200, "expected tooling-audit status 200");
      const toolingAuditJson = (await toolingAuditResponse.json()) as {
        canonicalToolId?: string;
        deprecated?: boolean;
        run?: { status?: string };
        deprecation?: { toolId?: string };
      };
      assert.equal(
        toolingAuditJson.canonicalToolId,
        "desloppify-prototype",
        "expected canonical tool for tooling-audit",
      );
      assert.equal(toolingAuditJson.deprecated, true, "expected tooling-audit deprecated flag");
      assert.equal(
        toolingAuditJson.deprecation?.toolId,
        "tooling-audit",
        "expected deprecation tool id",
      );
      assert.equal(
        toolingAuditJson.run?.status,
        "success",
        "expected tooling-audit run status success",
      );

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            runId,
            tools: {
              canonicalToolId: toolsJson.canonicalToolId,
              status: toolsJson.run?.status || null,
            },
            toolingAudit: {
              canonicalToolId: toolingAuditJson.canonicalToolId,
              deprecated: toolingAuditJson.deprecated || false,
              status: toolingAuditJson.run?.status || null,
            },
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
