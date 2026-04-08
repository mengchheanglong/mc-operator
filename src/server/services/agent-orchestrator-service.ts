import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync } from "fs";
import { mkdir, readdir, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { getWorkspaceRootPath } from "@/server/projects/workspace-projects";
import { extractAoSessionIds } from "@/lib/agents/ao-parser";
import { runWithReliabilityGate, AdapterReliabilityError } from "@/server/adapters/reliability-gate";
import { validateExternalRunnerInput, validateExternalRunnerOutput } from "@/server/adapters/contracts";
import { resolveAgentOrchestratorRoot } from "@/server/paths/directive-source-packs";

const execFileAsync = promisify(execFile);

export interface AgentOrchestratorResult {
  ok: boolean;
  status: number;
  body: string;
  command: string;
  args: string[];
  sessionId: string | null;
  sessionIds?: string[];
  parsed?: Record<string, unknown> | null;
}

interface AoRunResult {
  ok: boolean;
  status: number;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  body: string;
}

interface AoRunOptions {
  cwd?: string;
}

interface AoDispatchRuntime {
  cwd: string;
  projectId: string;
}

const AO_CLI = "packages/cli/dist/index.js";
let cachedAoRoot: string | null = null;

async function resolveAoRoot() {
  if (cachedAoRoot && existsSync(path.join(cachedAoRoot, AO_CLI))) {
    return cachedAoRoot;
  }

  const preferredRoot = resolveAgentOrchestratorRoot();
  const candidates = [preferredRoot];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, AO_CLI))) {
      cachedAoRoot = candidate;
      return candidate;
    }
  }

  cachedAoRoot = candidates[0];
  return cachedAoRoot;
}

function toPortablePath(value: string): string {
  return value.replace(/\\/g, "/");
}

async function resolveGitBranch(projectPath: string): Promise<string> {
  try {
    const { stdout = "" } = await execFileAsync("git", ["-C", projectPath, "rev-parse", "--abbrev-ref", "HEAD"], {
      windowsHide: true,
      timeout: 15_000,
    });
    const branch = String(stdout || "").trim();
    return branch || "main";
  } catch {
    return "main";
  }
}

async function ensureGitSafeDirectory(projectPath: string): Promise<void> {
  try {
    await execFileAsync(
      "git",
      ["config", "--global", "--add", "safe.directory", toPortablePath(projectPath)],
      { windowsHide: true, timeout: 15_000 },
    );
  } catch {}
}

async function ensureAoDispatchRuntime(projectPath: string): Promise<AoDispatchRuntime> {
  const projectHash = createHash("sha1")
    .update(projectPath.toLowerCase())
    .digest("hex")
    .slice(0, 8);
  const runtimeRoot = path.join(projectPath, ".openclaw", "ao-dispatch-runtime");
  const dataDir = path.join(runtimeRoot, "data");
  const worktreeDir = path.join(runtimeRoot, "worktrees");
  const configPath = path.join(runtimeRoot, "agent-orchestrator.yaml");
  const branch = await resolveGitBranch(projectPath);
  const projectId = "dispatch-run";

  await mkdir(dataDir, { recursive: true });
  await mkdir(worktreeDir, { recursive: true });

  const config = [
    `dataDir: "${toPortablePath(dataDir)}"`,
    `worktreeDir: "${toPortablePath(worktreeDir)}"`,
    "port: 3000",
    "defaults:",
    "  runtime: process",
    "  agent: codex",
    "  workspace: worktree",
    "  notifiers:",
    "    - desktop",
    "projects:",
    `  ${projectId}:`,
    `    name: ${projectId}`,
    `    sessionPrefix: dr${projectHash.slice(0, 4)}`,
    "    repo: local/dispatch-run",
    `    path: "${toPortablePath(projectPath)}"`,
    `    defaultBranch: "${branch}"`,
    "    tracker:",
    "      plugin: none",
  ].join("\n");

  await writeFile(configPath, `${config}\n`, "utf8");

  return { cwd: runtimeRoot, projectId };
}

async function runAoCli(args: string[], options?: AoRunOptions): Promise<AoRunResult> {
  const command = "node";
  let aoRoot: string;
  let cliEntry: string;
  try {
    aoRoot = await resolveAoRoot();
    cliEntry = path.join(aoRoot, AO_CLI);
  } catch (error) {
    return {
      ok: false,
      status: 503,
      body: String((error as Error)?.message || "agent-orchestrator source pack inactive"),
      stdout: "",
      stderr: "",
      command,
      args: [AO_CLI, ...args],
    };
  }
  const fullArgs = [cliEntry, ...args];

  try {
    const { stdout = "", stderr = "" } = await execFileAsync(command, fullArgs, {
      cwd: options?.cwd || aoRoot,
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 4,
    });
    const out = String(stdout || "").trim();
    const err = String(stderr || "").trim();

    return {
      ok: true,
      status: 200,
      body: [out, err].filter(Boolean).join("\n\n"),
      stdout: out,
      stderr: err,
      command,
      args: fullArgs,
    };
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string; code?: number | string; message: string };
    const out = String(execError.stdout || "").trim();
    const err = String(execError.stderr || "").trim();

    return {
      ok: false,
      status: typeof execError.code === "number" ? execError.code : 500,
      body: [out, err, execError.message].filter(Boolean).join("\n\n"),
      stdout: out,
      stderr: err,
      command,
      args: fullArgs,
    };
  }
}

function parseAoBody(body: string): Record<string, unknown> | null {
  const lines = String(body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  const parsed: Record<string, unknown> = {};
  for (const line of lines) {
    const keyValue = line.match(/^([a-zA-Z][\w .-]{1,40})\s*:\s*(.+)$/);
    if (!keyValue) continue;
    const key = keyValue[1]
      .trim()
      .toLowerCase()
      .replace(/[\s.-]+/g, "_");
    const value = keyValue[2].trim();
    if (!key) continue;
    if (!(key in parsed)) {
      parsed[key] = value;
    }
  }

  const sessionIds = extractAoSessionIds(body);
  if (sessionIds.length) parsed.sessionIds = sessionIds;

  return Object.keys(parsed).length ? parsed : null;
}

function toAgentOrchestratorResult(run: AoRunResult, preferredSessionId?: string | null): AgentOrchestratorResult {
  const sessionIds = extractAoSessionIds(run.body);
  const parsed = parseAoBody(run.body);
  const sessionId = String(preferredSessionId || "").trim() || sessionIds[0] || null;

  return {
    ok: run.ok,
    status: run.status,
    body: run.body,
    command: run.command,
    args: run.args,
    sessionId,
    sessionIds,
    parsed,
  };
}

async function runAdapter(
  args: string[],
  preferredSessionId?: string | null,
  options?: AoRunOptions,
): Promise<AgentOrchestratorResult> {
  try {
    return await runWithReliabilityGate(
      { args },
      {
        adapter: "external-runner",
        source: "agent-orchestrator",
        timeoutMs: 180_000,
        retries: 1,
        validateInput: validateExternalRunnerInput,
        validateOutput: validateExternalRunnerOutput,
        run: async (input) => {
          const run = await runAoCli(input.args, options);
          return toAgentOrchestratorResult(run, preferredSessionId);
        },
        isRetryableError: (error) => String((error as Error)?.message || "").toLowerCase().includes("timeout"),
      },
    );
  } catch (error) {
    if (error instanceof AdapterReliabilityError) {
      return {
        ok: false,
        status: error.details.code === "invalid_input" ? 400 : error.details.code === "timeout" ? 408 : 502,
        body: error.details.reason,
        command: "node",
        args: [AO_CLI, ...args],
        sessionId: preferredSessionId?.trim() || null,
        sessionIds: [],
        parsed: { adapterError: error.details },
      };
    }
    return {
      ok: false,
      status: 500,
      body: String((error as Error)?.message || "external runner adapter failed"),
      command: "node",
      args: [AO_CLI, ...args],
      sessionId: preferredSessionId?.trim() || null,
      sessionIds: [],
      parsed: null,
    };
  }
}

export async function spawnAgentOrchestratorRun(projectPath: string, task: string): Promise<AgentOrchestratorResult> {
  await ensureGitSafeDirectory(projectPath);
  const runtime = await ensureAoDispatchRuntime(projectPath);
  return runAdapter(["spawn", runtime.projectId, task], null, { cwd: runtime.cwd });
}

export async function getAgentOrchestratorStatus(sessionId?: string | null): Promise<AgentOrchestratorResult> {
  return runAdapter(sessionId ? ["status", sessionId] : ["status"], sessionId);
}

export async function listAgentOrchestratorSessions(): Promise<AgentOrchestratorResult> {
  return runAdapter(["session", "ls"]);
}

export async function sendAgentOrchestratorMessage(sessionId: string, message: string): Promise<AgentOrchestratorResult> {
  return runAdapter(["send", sessionId, message], sessionId);
}

export async function restoreAgentOrchestratorSession(sessionId: string): Promise<AgentOrchestratorResult> {
  return runAdapter(["session", "restore", sessionId], sessionId);
}

export async function killAgentOrchestratorSession(sessionId: string): Promise<AgentOrchestratorResult> {
  return runAdapter(["session", "kill", sessionId], sessionId);
}
