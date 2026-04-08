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
  execSync('git config user.email "automation-check@example.com"', {
    cwd: projectRoot,
    stdio: "pipe",
  });
  execSync('git config user.name "Automation Check"', {
    cwd: projectRoot,
    stdio: "pipe",
  });
  writeFileSync(path.join(projectRoot, "README.md"), "# temp automation repo\n");
  execSync("git add README.md", { cwd: projectRoot, stdio: "pipe" });
  execSync('git commit -m "init"', { cwd: projectRoot, stdio: "pipe" });
}

async function run() {
  await withBackendTestEnv(
    {
      port: 3212,
      tempPrefix: "mission-control-automation-runs-api-",
      sqliteFilename: "automation-runs-api.sqlite",
      setup: (tempDir) => {
        const workspaceRoot = path.join(tempDir, "workspace");
        const projectRoot = path.join(workspaceRoot, "mission-control");
        setupTempRepo(projectRoot);
        return { OPENCLAW_WORKSPACE_ROOT: workspaceRoot };
      },
    },
    async (ctx) => {
      const runsRoute = await import("../src/app/api/automation/runs/route.ts");
      const createRoute = await import(
        "../src/app/api/automation/runs/create/route.ts"
      );
      const closeRoute = await import(
        "../src/app/api/automation/runs/[id]/close/route.ts"
      );
      const summaryRoute = await import(
        "../src/app/api/automation/runs/[id]/summary/route.ts"
      );

      const { GET: listRuns } = runsRoute;
      const { POST: createRun } = createRoute;
      const { POST: closeRun } = closeRoute;
      const { GET: runSummary } = summaryRoute;

      const initialList = await listRuns(
        new Request("http://localhost/api/automation/runs?projectId=mission-control", {
          method: "GET",
        }),
      );
      assert.equal(initialList.status, 200, "expected initial list status 200");
      const initialListJson = (await initialList.json()) as {
        runs?: Array<{ id?: string }>;
        staleRuns?: string[];
      };
      assert.ok(Array.isArray(initialListJson.runs), "expected runs array");
      assert.ok(Array.isArray(initialListJson.staleRuns), "expected staleRuns array");

      const createResponse = await createRun(
        new Request("http://localhost/api/automation/runs/create?projectId=mission-control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            branch: "main",
            metadata: { purpose: "automation-runs-backend-check" },
          }),
        }),
      );
      assert.equal(createResponse.status, 200, "expected create status 200");
      const createJson = (await createResponse.json()) as {
        run?: { id?: string; status?: string; branch?: string };
      };
      const runId = String(createJson.run?.id || "").trim();
      assert.ok(runId, "expected run id from create");
      assert.equal(createJson.run?.branch, "main", "expected run branch main");

      const summaryResponse = await runSummary(
        new Request(
          `http://localhost/api/automation/runs/${runId}/summary?projectId=mission-control`,
          { method: "GET" },
        ),
        { params: Promise.resolve({ id: runId }) },
      );
      assert.equal(summaryResponse.status, 200, "expected summary status 200");
      const summaryJson = (await summaryResponse.json()) as {
        run?: { id?: string; status?: string };
        summary?: { verificationArtifacts?: { reportId?: string | null } };
      };
      assert.equal(summaryJson.run?.id, runId, "expected summary run id");

      const closeResponse = await closeRun(
        new Request(
          `http://localhost/api/automation/runs/${runId}/close?projectId=mission-control`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ archive: false, reason: "manual" }),
          },
        ),
        { params: Promise.resolve({ id: runId }) },
      );
      assert.equal(closeResponse.status, 200, "expected close status 200");
      const closeJson = (await closeResponse.json()) as {
        run?: { status?: string };
      };
      assert.ok(
        ["closed", "archived", "closing_pending_cleanup"].includes(
          String(closeJson.run?.status || ""),
        ),
        "expected closed-like run status",
      );

      const finalList = await listRuns(
        new Request("http://localhost/api/automation/runs?projectId=mission-control", {
          method: "GET",
        }),
      );
      assert.equal(finalList.status, 200, "expected final list status 200");
      const finalListJson = (await finalList.json()) as {
        runs?: Array<{ id?: string; status?: string }>;
        staleRuns?: string[];
      };
      const listedRun = (finalListJson.runs || []).find((row) => row.id === runId);
      assert.ok(listedRun, "expected run still present in list");

      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            runId,
            initialCount: initialListJson.runs?.length || 0,
            finalCount: finalListJson.runs?.length || 0,
            finalStatus: listedRun?.status || null,
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
