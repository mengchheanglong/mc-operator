import assert from "node:assert/strict";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type ImportedAgent = {
  name?: string;
  sourcePack?: string;
  sourceRef?: string;
  workflowProfile?: {
    mode?: string;
    objectives?: string[];
    constraints?: string[];
    deliverables?: string[];
  };
  packAssets?: Array<{ label?: string; path?: string; kind?: string }>;
};

type SmokeReport = {
  suite: "skills-manager-import-smoke";
  ok: boolean;
  generatedAt: string;
  workspaceRoot: string;
  backendBaseUrl: string;
  sourcePack: "skills-manager";
  latestPath?: string;
  archivePath?: string;
  importedCount?: number;
  updatedCount?: number;
  importedAgent?: {
    name: string;
    sourcePack: string;
    sourceRef: string;
    workflowMode: string;
    packAssetLabels: string[];
    packAssetCount: number;
  };
  error?: string;
};

async function waitForHealth(baseUrl: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`backend health check timed out: ${baseUrl}/health`);
}

function isoStamp(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function reportPaths() {
  const reportsDir = path.join(process.cwd(), "reports", "agent-pack-imports");
  mkdirSync(reportsDir, { recursive: true });
  const generatedAt = new Date();
  return {
    generatedAt: generatedAt.toISOString(),
    latestPath: path.join(reportsDir, "skills-manager-latest.json"),
    archivePath: path.join(reportsDir, `skills-manager-${isoStamp(generatedAt)}.json`),
  };
}

function writeReport(report: SmokeReport) {
  const { latestPath, archivePath } = reportPaths();
  const finalReport = {
    ...report,
    latestPath,
    archivePath,
  };
  writeFileSync(latestPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
  writeFileSync(archivePath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
  return finalReport;
}

async function run() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "mission-control-skills-manager-import-"));
  const sqlitePath = path.join(tempDir, "skills-manager-import-smoke.sqlite");
  const workspaceRoot = path.resolve(process.cwd(), "..");
  const backendPort = 3221 + Math.floor(Math.random() * 200);
  const backendBaseUrl = `http://127.0.0.1:${backendPort}/api/v1`;
  let backendProcess: ChildProcess | null = null;
  let backendStdout = "";
  let backendStderr = "";

  try {
    process.env.SQLITE_PATH = sqlitePath;
    process.env.OPENCLAW_WORKSPACE_ROOT = workspaceRoot;
    process.env.MISSION_CONTROL_BACKEND_BASE_URL = backendBaseUrl;

    execSync("npm --prefix ./backend run build", { stdio: "pipe" });

    backendProcess = spawn(process.execPath, [path.join("dist", "main.js")], {
      cwd: path.join(process.cwd(), "backend"),
      env: {
        ...process.env,
        SQLITE_PATH: sqlitePath,
        OPENCLAW_WORKSPACE_ROOT: workspaceRoot,
        MISSION_CONTROL_BACKEND_BASE_URL: backendBaseUrl,
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
      throw new Error(`backend startup failed: ${String(error)}\nstdout:\n${backendStdout}\nstderr:\n${backendStderr}`);
    }

    const importRoute = await import("../src/app/api/agents/import-packs/route.ts");

    const importResponse = await importRoute.POST(
      new Request("http://localhost/api/agents/import-packs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: ["skills-manager"] }),
      }),
    );
    assert.equal(importResponse.status, 200, "expected import packs to return 200");
    const importJson = (await importResponse.json()) as {
      agents?: ImportedAgent[];
      updatedCount?: number;
    };
    const importedAgent = Array.isArray(importJson.agents)
      ? importJson.agents.find((agent) => agent.sourcePack === "skills-manager")
      : undefined;
    assert.ok(importedAgent, "expected imported skills-manager agent");
    assert.equal(importedAgent?.name, "Skills Lifecycle Operator");
    assert.equal(importedAgent?.sourceRef, "skills-manager/lifecycle-operator");

    const assetLabels = Array.isArray(importedAgent?.packAssets)
      ? importedAgent!.packAssets!.map((asset) => String(asset.label || "").trim()).filter(Boolean)
      : [];
    for (const requiredLabel of ["README.md", "scripts", "src", "assets"]) {
      assert.ok(assetLabels.includes(requiredLabel), `expected imported pack assets to include ${requiredLabel}`);
    }

    const syncResponse = await importRoute.POST(
      new Request("http://localhost/api/agents/import-packs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: ["skills-manager"], syncExisting: true }),
      }),
    );
    assert.equal(syncResponse.status, 200, "expected sync import packs to return 200");
    const syncJson = (await syncResponse.json()) as { updatedCount?: number };
    assert.ok((syncJson.updatedCount || 0) >= 1, "expected syncExisting import to update existing agents");

    const report = writeReport({
      suite: "skills-manager-import-smoke",
      ok: true,
      generatedAt: new Date().toISOString(),
      workspaceRoot,
      backendBaseUrl,
      sourcePack: "skills-manager",
      importedCount: Array.isArray(importJson.agents) ? importJson.agents.length : 0,
      updatedCount: syncJson.updatedCount || 0,
      importedAgent: {
        name: String(importedAgent?.name || ""),
        sourcePack: String(importedAgent?.sourcePack || ""),
        sourceRef: String(importedAgent?.sourceRef || ""),
        workflowMode: String(importedAgent?.workflowProfile?.mode || ""),
        packAssetLabels: assetLabels,
        packAssetCount: assetLabels.length,
      },
    });

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    const report = writeReport({
      suite: "skills-manager-import-smoke",
      ok: false,
      generatedAt: new Date().toISOString(),
      workspaceRoot,
      backendBaseUrl,
      sourcePack: "skills-manager",
      error: String(error),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    throw error;
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
