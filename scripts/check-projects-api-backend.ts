import assert from "node:assert/strict";
import path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";

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

async function run() {
  const backendPort = 3208;
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
        MISSION_CONTROL_BACKEND_PORT: String(backendPort),
        MISSION_CONTROL_BACKEND_HOST: "127.0.0.1",
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

    const { GET: listProjects } = await import("../src/app/api/projects/route.ts");
    const { GET: graphProjects } = await import(
      "../src/app/api/projects/graph/route.ts"
    );

    const listReq = new Request(
      "http://localhost/api/projects?projectId=mission-control",
      { method: "GET" },
    );
    const listRes = await listProjects(listReq);
    assert.equal(listRes.status, 200, "expected projects list 200");
    const listJson = (await listRes.json()) as {
      activeProject?: { id?: string };
      projects?: Array<{ id?: string; isControlPlane?: boolean }>;
    };
    assert.ok(listJson.activeProject?.id, "expected activeProject.id");
    assert.ok(Array.isArray(listJson.projects), "expected projects array");
    assert.ok((listJson.projects?.length || 0) >= 1, "expected at least one project");

    const graphReq = new Request(
      "http://localhost/api/projects/graph?projectId=mission-control",
      { method: "GET" },
    );
    const graphRes = await graphProjects(graphReq);
    assert.equal(graphRes.status, 200, "expected projects graph 200");
    const graphJson = (await graphRes.json()) as {
      activeProject?: { id?: string };
      projects?: Array<{ id?: string; isControlPlane?: boolean }>;
    };
    assert.ok(graphJson.activeProject?.id, "expected graph activeProject.id");
    assert.ok(Array.isArray(graphJson.projects), "expected graph projects array");
    assert.equal(
      graphJson.projects?.some((project) => project.isControlPlane === true) ?? false,
      false,
      "expected graph projects to exclude control plane",
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          activeProjectId: listJson.activeProject?.id || null,
          counts: {
            projects: listJson.projects?.length || 0,
            graphProjects: graphJson.projects?.length || 0,
          },
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill("SIGTERM");
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
