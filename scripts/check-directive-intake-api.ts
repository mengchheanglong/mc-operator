import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
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
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "mission-control-intake-api-"));
  process.env.SQLITE_PATH = path.join(tempDir, "directive-intake-api.sqlite");
  const backendPort = 3205;
  const backendBaseUrl = `http://127.0.0.1:${backendPort}/api/v1`;
  process.env.MISSION_CONTROL_BACKEND_BASE_URL = backendBaseUrl;

  let backendProcess: ChildProcess | null = null;
  let backendStdout = "";
  let backendStderr = "";

  try {
    execSync("npm --prefix ./backend run build", { stdio: "pipe" });
    backendProcess = spawn(
      process.execPath,
      [path.join("dist", "main.js")],
      {
        cwd: path.join(process.cwd(), "backend"),
        env: {
          ...process.env,
          SQLITE_PATH: process.env.SQLITE_PATH,
          MISSION_CONTROL_BACKEND_PORT: String(backendPort),
          MISSION_CONTROL_BACKEND_HOST: "127.0.0.1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
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

    const { GET, POST } = await import(
      "../src/app/api/directive-workspace/capabilities/route.ts"
    );

    const intakeBody = {
      sourceType: "github-repo",
      sourceRef: "https://github.com/example/directive-intake-check.git",
      title: "directive-intake-check",
      userIntent: "Verify directive intake API path is functional.",
      notes: ["api-check", "phase-1-day-3"],
    };

    const postReq = new Request(
      "http://localhost/api/directive-workspace/capabilities?projectId=mission-control",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intakeBody),
      },
    );

    const postRes = await POST(postReq);
    assert.equal(postRes.status, 201, "expected intake POST 201");
    const postJson = (await postRes.json()) as {
      ok?: boolean;
      capability?: { id?: string; sourceRef?: string; status?: string };
    };

    assert.equal(postJson.ok, true, "expected intake POST ok=true");
    assert.ok(postJson.capability?.id, "expected capability id");
    assert.equal(
      postJson.capability?.sourceRef,
      intakeBody.sourceRef,
      "expected sourceRef persisted",
    );

    const getReq = new Request(
      "http://localhost/api/directive-workspace/capabilities?projectId=mission-control&status=intake",
      { method: "GET" },
    );

    const getRes = await GET(getReq);
    assert.equal(getRes.status, 200, "expected intake GET 200");
    const getJson = (await getRes.json()) as {
      capabilities?: Array<{ id?: string; status?: string; sourceRef?: string }>;
    };

    const capabilities = getJson.capabilities || [];
    const created = capabilities.find(
      (capability) => capability.id === postJson.capability?.id,
    );

    assert.ok(created, "expected created capability in GET list");
    assert.equal(created?.status, "intake", "expected created capability to stay intake");

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          capabilityId: postJson.capability?.id,
          sourceRef: postJson.capability?.sourceRef,
          status: created?.status,
          listedCount: capabilities.length,
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
