import assert from "node:assert/strict";
import { exec, execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getAgentOrchestratorSourcePackPath } from "@/server/paths/directive-source-packs";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

type SmokeReport = {
  suite: "agent-orchestrator-cli-smoke";
  ok: boolean;
  generatedAt: string;
  workspaceRoot: string;
  sourcePack: "agent-orchestrator";
  sourcePackClassification: "follow_up_only";
  sourcePackActivationMode: "manual_follow_up";
  cliEntryRelativePath?: string;
  statusCommand?: string;
  statusOutputKind?: string;
  statusSessionCount?: number;
  builtPackages?: string[];
  targetProjectPath?: string;
  latestPath?: string;
  archivePath?: string;
  error?: string;
};

function isoStamp(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function reportPaths() {
  const reportsDir = path.join(process.cwd(), "reports", "ao-cli-smoke");
  mkdirSync(reportsDir, { recursive: true });
  const generatedAt = new Date();
  return {
    generatedAt: generatedAt.toISOString(),
    latestPath: path.join(reportsDir, "agent-orchestrator-latest.json"),
    archivePath: path.join(reportsDir, `agent-orchestrator-${isoStamp(generatedAt)}.json`),
  };
}

function writeReport(report: SmokeReport) {
  const { latestPath, archivePath } = reportPaths();
  const finalReport = { ...report, latestPath, archivePath };
  writeFileSync(latestPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
  writeFileSync(archivePath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
  return finalReport;
}

async function runPnpm(packRoot: string, args: string[]) {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const { stdout = "", stderr = "" } = await execAsync([pnpmCommand, ...args].join(" "), {
    cwd: packRoot,
    windowsHide: true,
    shell: true,
    timeout: 1_200_000,
    maxBuffer: 1024 * 1024 * 16,
  });
  return {
    stdout: String(stdout || ""),
    stderr: String(stderr || ""),
  };
}

async function resolveBranch(projectRoot: string) {
  try {
    const { stdout = "" } = await execFileAsync(
      "git",
      ["-C", projectRoot, "rev-parse", "--abbrev-ref", "HEAD"],
      { windowsHide: true, timeout: 15_000 },
    );
    return String(stdout || "").trim() || "main";
  } catch {
    return "main";
  }
}

async function run() {
  const workspaceRoot = path.resolve(process.cwd(), "..");
  const sourcePackRoot = getAgentOrchestratorSourcePackPath();
  const readyMarkerPath = path.join(sourcePackRoot, "SOURCE_PACK_READY.md");
  const targetProjectPath = path.join(workspaceRoot, "mission-control");
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "mission-control-ao-cli-smoke-"));
  const packCopyRoot = path.join(tempRoot, "agent-orchestrator");
  const runtimeRoot = path.join(tempRoot, "runtime");
  const builtPackages = [
    "@composio/ao-core",
    "@composio/ao-plugin-agent-claude-code",
    "@composio/ao-plugin-agent-codex",
    "@composio/ao-plugin-agent-aider",
    "@composio/ao-plugin-agent-opencode",
    "@composio/ao-plugin-scm-github",
    "@composio/ao-cli",
  ];

  try {
    assert.ok(existsSync(readyMarkerPath), `missing ready marker: ${readyMarkerPath}`);
    cpSync(sourcePackRoot, packCopyRoot, {
      recursive: true,
      filter: (src) => {
        const base = path.basename(src);
        return !["node_modules", "dist", ".pnpm-store", ".next", "coverage"].includes(base);
      },
    });

    await runPnpm(packCopyRoot, ["install", "--ignore-scripts", "--frozen-lockfile"]);
    await runPnpm(packCopyRoot, ["--filter", "@composio/ao-core", "build"]);
    await runPnpm(packCopyRoot, [
      "--filter",
      "@composio/ao-plugin-agent-claude-code",
      "--filter",
      "@composio/ao-plugin-agent-codex",
      "--filter",
      "@composio/ao-plugin-agent-aider",
      "--filter",
      "@composio/ao-plugin-agent-opencode",
      "--filter",
      "@composio/ao-plugin-scm-github",
      "build",
    ]);
    await runPnpm(packCopyRoot, ["--filter", "@composio/ao-cli", "build"]);

    const branch = await resolveBranch(targetProjectPath);
    mkdirSync(path.join(runtimeRoot, "data"), { recursive: true });
    mkdirSync(path.join(runtimeRoot, "worktrees"), { recursive: true });
    writeFileSync(
      path.join(runtimeRoot, "agent-orchestrator.yaml"),
      [
        `dataDir: "${path.join(runtimeRoot, "data").replace(/\\/g, "/")}"`,
        `worktreeDir: "${path.join(runtimeRoot, "worktrees").replace(/\\/g, "/")}"`,
        "port: 3000",
        "defaults:",
        "  runtime: process",
        "  agent: codex",
        "  workspace: worktree",
        "  notifiers:",
        "    - desktop",
        "projects:",
        "  mc-smoke:",
        "    name: mc-smoke",
        "    sessionPrefix: mcsm",
        "    repo: local/mission-control",
        `    path: "${targetProjectPath.replace(/\\/g, "/")}"`,
        `    defaultBranch: "${branch}"`,
      ].join("\n"),
      "utf8",
    );

    const cliEntry = path.join(packCopyRoot, "packages", "cli", "dist", "index.js");
    assert.ok(existsSync(cliEntry), `missing built cli entry: ${cliEntry}`);
    const { stdout = "" } = await execFileAsync("node", [cliEntry, "status", "--json"], {
      cwd: runtimeRoot,
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 1024 * 1024 * 8,
    });
    const parsed = JSON.parse(String(stdout || "").trim()) as unknown;
    assert.ok(Array.isArray(parsed), "expected ao status --json to return a JSON array");

    const report = writeReport({
      suite: "agent-orchestrator-cli-smoke",
      ok: true,
      generatedAt: new Date().toISOString(),
      workspaceRoot,
      sourcePack: "agent-orchestrator",
      sourcePackClassification: "follow_up_only",
      sourcePackActivationMode: "manual_follow_up",
      cliEntryRelativePath: "packages/cli/dist/index.js",
      statusCommand: "ao status --json",
      statusOutputKind: "json-array",
      statusSessionCount: parsed.length,
      builtPackages,
      targetProjectPath,
    });

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    const report = writeReport({
      suite: "agent-orchestrator-cli-smoke",
      ok: false,
      generatedAt: new Date().toISOString(),
      workspaceRoot,
      sourcePack: "agent-orchestrator",
      sourcePackClassification: "follow_up_only",
      sourcePackActivationMode: "manual_follow_up",
      error: String(error),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    throw error;
  } finally {
    try {
      rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
