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
  };
  packAssets?: Array<{ label?: string; path?: string; kind?: string }>;
};

type SmokeReport = {
  suite: "arscontexta-import-smoke";
  ok: boolean;
  generatedAt: string;
  workspaceRoot: string;
  backendBaseUrl: string;
  sourcePack: "arscontexta";
  latestPath?: string;
  archivePath?: string;
  defaultImportArscontextaCount?: number;
  importedCount?: number;
  updatedCount?: number;
  importedAgents?: Array<{
    name: string;
    sourcePack: string;
    sourceRef: string;
    workflowMode: string;
    packAssetLabels: string[];
  }>;
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
    latestPath: path.join(reportsDir, "arscontexta-latest.json"),
    archivePath: path.join(reportsDir, `arscontexta-${isoStamp(generatedAt)}.json`),
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

function getImportedArsAgents(input: { agents?: ImportedAgent[] }) {
  return Array.isArray(input.agents)
    ? input.agents.filter((agent) => agent.sourcePack === "arscontexta")
    : [];
}

function getPackAssetLabels(agent: ImportedAgent) {
  return Array.isArray(agent.packAssets)
    ? agent.packAssets.map((asset) => String(asset.label || "").trim()).filter(Boolean)
    : [];
}

async function run() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "mission-control-arscontexta-import-"));
  const sqlitePath = path.join(tempDir, "arscontexta-import-smoke.sqlite");
  const workspaceRoot = path.resolve(process.cwd(), "..");
  const backendPort = 3361 + Math.floor(Math.random() * 200);
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

    const defaultImportResponse = await importRoute.POST(
      new Request("http://localhost/api/agents/import-packs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    assert.equal(defaultImportResponse.status, 200, "expected default import packs to return 200");
    const defaultImportJson = (await defaultImportResponse.json()) as {
      agents?: ImportedAgent[];
      updatedCount?: number;
    };
    const defaultImportArscontextaCount = getImportedArsAgents(defaultImportJson).length;
    assert.equal(
      defaultImportArscontextaCount,
      0,
      "expected arscontexta to remain excluded from default import",
    );

    const importResponse = await importRoute.POST(
      new Request("http://localhost/api/agents/import-packs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: ["arscontexta"] }),
      }),
    );
    assert.equal(importResponse.status, 200, "expected explicit arscontexta import to return 200");
    const importJson = (await importResponse.json()) as {
      agents?: ImportedAgent[];
      updatedCount?: number;
    };
    const arsAgents = getImportedArsAgents(importJson);
    assert.equal(arsAgents.length, 3, "expected three imported arscontexta agents");

    const expectedNames = [
      "Ars Context Architect",
      "Ars Delivery Builder",
      "Ars Quality Reviewer",
    ].sort();
    const expectedRefs = [
      "arscontexta/context-architect",
      "arscontexta/delivery-builder",
      "arscontexta/quality-reviewer",
    ].sort();
    const expectedModes = ["execution", "planning", "review"].sort();
    const actualNames = arsAgents.map((agent) => String(agent.name || "")).sort();
    const actualRefs = arsAgents.map((agent) => String(agent.sourceRef || "")).sort();
    const actualModes = arsAgents
      .map((agent) => String(agent.workflowProfile?.mode || ""))
      .sort();

    assert.deepEqual(actualNames, expectedNames, "unexpected arscontexta imported agent names");
    assert.deepEqual(actualRefs, expectedRefs, "unexpected arscontexta source refs");
    assert.deepEqual(actualModes, expectedModes, "unexpected arscontexta workflow modes");

    const requiredAssets = ["README.md", "methodology", "reference", "skills", "skill-sources"];
    for (const agent of arsAgents) {
      const assetLabels = getPackAssetLabels(agent);
      for (const requiredLabel of requiredAssets) {
        assert.ok(
          assetLabels.includes(requiredLabel),
          `expected arscontexta imported pack assets to include ${requiredLabel}`,
        );
      }
    }

    const syncResponse = await importRoute.POST(
      new Request("http://localhost/api/agents/import-packs?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: ["arscontexta"], syncExisting: true }),
      }),
    );
    assert.equal(syncResponse.status, 200, "expected sync import packs to return 200");
    const syncJson = (await syncResponse.json()) as { updatedCount?: number };
    assert.ok((syncJson.updatedCount || 0) >= 3, "expected syncExisting arscontexta import to update existing agents");

    const report = writeReport({
      suite: "arscontexta-import-smoke",
      ok: true,
      generatedAt: new Date().toISOString(),
      workspaceRoot,
      backendBaseUrl,
      sourcePack: "arscontexta",
      defaultImportArscontextaCount,
      importedCount: arsAgents.length,
      updatedCount: syncJson.updatedCount || 0,
      importedAgents: arsAgents.map((agent) => ({
        name: String(agent.name || ""),
        sourcePack: String(agent.sourcePack || ""),
        sourceRef: String(agent.sourceRef || ""),
        workflowMode: String(agent.workflowProfile?.mode || ""),
        packAssetLabels: getPackAssetLabels(agent),
      })),
    });

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    const report = writeReport({
      suite: "arscontexta-import-smoke",
      ok: false,
      generatedAt: new Date().toISOString(),
      workspaceRoot,
      backendBaseUrl,
      sourcePack: "arscontexta",
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
