import assert from "node:assert/strict";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

async function waitForHealth(baseUrl: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`backend health check timed out: ${baseUrl}/health`);
}

function setupTempRepo(projectRoot: string) {
  mkdirSync(projectRoot, { recursive: true });
  try {
    execSync("git init -b main", { cwd: projectRoot, stdio: "pipe" });
  } catch {
    execSync("git init", { cwd: projectRoot, stdio: "pipe" });
    execSync("git checkout -B main", { cwd: projectRoot, stdio: "pipe" });
  }
  execSync('git config user.email "migration-batch-check@example.com"', {
    cwd: projectRoot,
    stdio: "pipe",
  });
  execSync('git config user.name "Migration Batch Check"', {
    cwd: projectRoot,
    stdio: "pipe",
  });
  writeFileSync(path.join(projectRoot, "README.md"), "# migration batch test repo\n");
  execSync("git add README.md", { cwd: projectRoot, stdio: "pipe" });
  execSync('git commit -m "init"', { cwd: projectRoot, stdio: "pipe" });
}

async function run() {
  const tempDir = mkdtempSync(
    path.join(os.tmpdir(), "mission-control-migration-batch-api-"),
  );
  process.env.SQLITE_PATH = path.join(tempDir, "migration-batch-api.sqlite");
  process.env.OPENCLAW_AUTOMATION_TOKEN = "batch-token";

  const workspaceRoot = path.join(tempDir, "workspace");
  const projectRoot = path.join(workspaceRoot, "mission-control");
  setupTempRepo(projectRoot);

  const backendPort = 3218;
  const backendBaseUrl = `http://127.0.0.1:${backendPort}/api/v1`;
  process.env.MISSION_CONTROL_BACKEND_BASE_URL = backendBaseUrl;

  let backendProcess: ChildProcess | null = null;
  let backendStdout = "";
  let backendStderr = "";

  try {
    execSync("npm --prefix ./backend run build", { stdio: "pipe" });
    backendProcess = spawn(process.execPath, [path.join("dist", "main.js")], {
      cwd: path.join(process.cwd(), "backend"),
      env: {
        ...process.env,
        SQLITE_PATH: process.env.SQLITE_PATH,
        OPENCLAW_AUTOMATION_TOKEN: process.env.OPENCLAW_AUTOMATION_TOKEN,
        MISSION_CONTROL_BACKEND_PORT: String(backendPort),
        MISSION_CONTROL_BACKEND_HOST: "127.0.0.1",
        OPENCLAW_WORKSPACE_ROOT: workspaceRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    backendProcess.stdout?.on("data", (chunk) => {
      backendStdout += chunk.toString();
    });
    backendProcess.stderr?.on("data", (chunk) => {
      backendStderr += chunk.toString();
    });

    try {
      await waitForHealth(backendBaseUrl, 20_000);
    } catch (error) {
      console.error("Backend startup stdout:", backendStdout);
      console.error("Backend startup stderr:", backendStderr);
      throw error;
    }

    const automationReportsRoute = await import("../src/app/api/automation/reports/route.ts");
    const automationQuestsRoute = await import("../src/app/api/automation/quests/route.ts");
    const automationSessionBriefRoute = await import(
      "../src/app/api/automation/session-brief/route.ts"
    );
    const contextExportRoute = await import("../src/app/api/context/export/route.ts");
    const codeGraphIndexRoute = await import("../src/app/api/code-graph/index/route.ts");
    const workspaceBootstrapRoute = await import("../src/app/api/workspace/bootstrap/route.ts");
    const workflowGuardsRoute = await import("../src/app/api/workflow/guards/route.ts");
    const opsHealthRoute = await import("../src/app/api/ops/health/route.ts");
    const opsNightlyRoute = await import("../src/app/api/ops/nightly/route.ts");
    const setActiveProjectRoute = await import("../src/app/api/projects/active/route.ts");
    const activateProjectRoute = await import("../src/app/api/projects/activate/route.ts");

    const { POST: createAutomationReport } = automationReportsRoute;
    const { POST: createAutomationQuest } = automationQuestsRoute;
    const { GET: getAutomationSessionBrief } = automationSessionBriefRoute;
    const { GET: getContextExport } = contextExportRoute;
    const { POST: postCodeGraphIndex } = codeGraphIndexRoute;
    const { POST: postWorkspaceBootstrap } = workspaceBootstrapRoute;
    const { GET: getWorkflowGuards } = workflowGuardsRoute;
    const { GET: getOpsHealth } = opsHealthRoute;
    const { GET: getOpsNightly } = opsNightlyRoute;
    const { POST: setActiveProject } = setActiveProjectRoute;
    const { GET: activateProject } = activateProjectRoute;

    const reportResponse = await createAutomationReport(
      new Request("http://localhost/api/automation/reports?projectId=mission-control", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openclaw-automation-token": String(process.env.OPENCLAW_AUTOMATION_TOKEN),
        },
        body: JSON.stringify({
          title: "Migration batch report",
          content: "verifying automation report proxy migration",
          category: "maintenance",
          status: "info",
          area: "automation",
          topics: ["migration", "backend"],
        }),
      }),
    );
    assert.equal(reportResponse.status, 200, "expected automation report status 200");
    const reportJson = (await reportResponse.json()) as {
      success?: boolean;
      report?: { id?: string };
    };
    assert.equal(reportJson.success, true, "expected report success true");
    assert.ok(String(reportJson.report?.id || "").trim(), "expected report id");

    const questResponse = await createAutomationQuest(
      new Request("http://localhost/api/automation/quests?projectId=mission-control", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openclaw-automation-token": String(process.env.OPENCLAW_AUTOMATION_TOKEN),
        },
        body: JSON.stringify({
          goal: "Verify migration batch quest path",
          difficulty: "normal",
          status: "open",
          area: "automation",
          topics: ["migration"],
        }),
      }),
    );
    assert.equal(questResponse.status, 200, "expected automation quest status 200");
    const questJson = (await questResponse.json()) as {
      success?: boolean;
      quest?: { id?: string; _id?: string };
    };
    assert.equal(questJson.success, true, "expected quest success true");
    assert.ok(
      String(questJson.quest?._id || questJson.quest?.id || "").trim(),
      "expected quest id",
    );

    const guardsResponse = await getWorkflowGuards(
      new Request("http://localhost/api/workflow/guards?projectId=mission-control&scope=agent", {
        method: "GET",
      }),
    );
    assert.equal(guardsResponse.status, 200, "expected workflow guards status 200");
    const guardsJson = (await guardsResponse.json()) as { guards?: unknown[] };
    assert.ok(Array.isArray(guardsJson.guards), "expected guards array");

    const opsHealthResponse = await getOpsHealth(
      new Request("http://localhost/api/ops/health?projectId=mission-control&view=failing", {
        method: "GET",
      }),
    );
    assert.equal(opsHealthResponse.status, 200, "expected ops health status 200");
    const opsHealthJson = (await opsHealthResponse.json()) as {
      failing?: unknown[];
      maxAgeHours?: number;
    };
    assert.ok(Array.isArray(opsHealthJson.failing), "expected failing array");
    assert.equal(typeof opsHealthJson.maxAgeHours, "number", "expected maxAgeHours number");

    const setActiveResponse = await setActiveProject(
      new Request("http://localhost/api/projects/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "mission-control" }),
      }),
    );
    assert.equal(setActiveResponse.status, 200, "expected set active project status 200");
    const setActiveJson = (await setActiveResponse.json()) as {
      project?: { id?: string };
    };
    assert.equal(setActiveJson.project?.id, "mission-control", "expected active project id");
    assert.ok(
      (setActiveResponse.headers.get("set-cookie") || "").includes("active_project"),
      "expected active_project cookie",
    );

    const activateResponse = await activateProject(
      new Request(
        "http://localhost/api/projects/activate?projectId=mission-control&next=%2Fdashboard",
        { method: "GET" },
      ) as unknown as import("next/server").NextRequest,
    );
    assert.ok(
      [302, 307, 308].includes(activateResponse.status),
      "expected redirect status for activate project",
    );
    assert.ok(
      (activateResponse.headers.get("set-cookie") || "").includes("active_project"),
      "expected active_project cookie on activate redirect",
    );

    const sessionBriefResponse = await getAutomationSessionBrief(
      new Request(
        "http://localhost/api/automation/session-brief?projectId=mission-control&tier=summary",
        {
          method: "GET",
          headers: {
            "x-openclaw-automation-token": String(process.env.OPENCLAW_AUTOMATION_TOKEN),
          },
        },
      ) as unknown as import("next/server").NextRequest,
    );
    assert.equal(sessionBriefResponse.status, 200, "expected session brief status 200");
    const sessionBriefJson = (await sessionBriefResponse.json()) as {
      success?: boolean;
      pack?: { project?: { id?: string } };
    };
    assert.equal(sessionBriefJson.success, true, "expected session brief success true");
    assert.equal(
      sessionBriefJson.pack?.project?.id,
      "mission-control",
      "expected session brief project id",
    );

    const contextExportResponse = await getContextExport(
      new Request("http://localhost/api/context/export?projectId=mission-control&tier=summary", {
        method: "GET",
      }) as unknown as import("next/server").NextRequest,
    );
    assert.equal(contextExportResponse.status, 200, "expected context export status 200");
    const contextExportJson = (await contextExportResponse.json()) as {
      success?: boolean;
      pack?: { project?: { id?: string } };
    };
    assert.equal(contextExportJson.success, true, "expected context export success true");
    assert.equal(
      contextExportJson.pack?.project?.id,
      "mission-control",
      "expected context export project id",
    );

    const workspaceBootstrapResponse = await postWorkspaceBootstrap(
      new Request("http://localhost/api/workspace/bootstrap?projectId=mission-control", {
        method: "POST",
      }),
    );
    assert.equal(workspaceBootstrapResponse.status, 200, "expected workspace bootstrap status 200");
    const workspaceBootstrapJson = (await workspaceBootstrapResponse.json()) as {
      msg?: string;
      firstDocId?: string | null;
    };
    assert.ok(
      typeof workspaceBootstrapJson.msg === "string" &&
        workspaceBootstrapJson.msg.length > 0,
      "expected workspace bootstrap message",
    );

    const codeGraphIndexResponse = await postCodeGraphIndex(
      new Request("http://localhost/api/code-graph/index?projectId=mission-control", {
        method: "POST",
      }),
    );
    assert.ok(
      [200, 400].includes(codeGraphIndexResponse.status),
      "expected code graph index status 200 or 400",
    );
    const codeGraphIndexJson = (await codeGraphIndexResponse.json()) as {
      success?: boolean;
      message?: string;
    };
    assert.equal(
      typeof codeGraphIndexJson.success,
      "boolean",
      "expected code graph success boolean",
    );
    assert.ok(
      typeof codeGraphIndexJson.message === "string" &&
        codeGraphIndexJson.message.length > 0,
      "expected code graph message",
    );

    const opsNightlyResponse = await getOpsNightly(
      new Request("http://localhost/api/ops/nightly?projectId=mission-control&view=failing", {
        method: "GET",
      }),
    );
    assert.equal(opsNightlyResponse.status, 200, "expected ops nightly status 200");
    const opsNightlyJson = (await opsNightlyResponse.json()) as {
      failing?: unknown[];
      maxAgeHours?: number;
    };
    assert.ok(Array.isArray(opsNightlyJson.failing), "expected ops nightly failing array");
    assert.equal(typeof opsNightlyJson.maxAgeHours, "number", "expected nightly maxAgeHours");

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          reportId: reportJson.report?.id || null,
          questId: questJson.quest?._id || questJson.quest?.id || null,
          guardsCount: Array.isArray(guardsJson.guards) ? guardsJson.guards.length : null,
          opsHealthFailingCount: Array.isArray(opsHealthJson.failing)
            ? opsHealthJson.failing.length
            : null,
          opsNightlyFailingCount: Array.isArray(opsNightlyJson.failing)
            ? opsNightlyJson.failing.length
            : null,
          activeProjectId: setActiveJson.project?.id || null,
          activateStatus: activateResponse.status,
          bootstrapFirstDocId: workspaceBootstrapJson.firstDocId || null,
          codeGraphIndexStatus: codeGraphIndexResponse.status,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill("SIGTERM");
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
