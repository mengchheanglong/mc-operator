import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { getWorkspaceRootPath } from "@/server/projects/workspace-projects";
import { extractAoSessionIds } from "@/lib/agents/ao-parser";
import { runWithReliabilityGate, AdapterReliabilityError } from "@/server/adapters/reliability-gate";
import { validateExternalRunnerInput, validateExternalRunnerOutput } from "@/server/adapters/contracts";

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

const AO_CLI = "packages/cli/dist/index.js";
let cachedAoRoot: string | null = null;

async function resolveAoRoot() {
  if (cachedAoRoot && existsSync(path.join(cachedAoRoot, AO_CLI))) {
    return cachedAoRoot;
  }

  const workspaceRoot = getWorkspaceRootPath();
  const toolingRoot = path.join(workspaceRoot, "agent-lab", "tooling");
  const candidates = [
    path.join(toolingRoot, "agent-orchestrator"),
    path.join(toolingRoot, "agent_orchestrator"),
    path.join(toolingRoot, "ao"),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, AO_CLI))) {
      cachedAoRoot = candidate;
      return candidate;
    }
  }

  try {
    const entries = await readdir(toolingRoot, { withFileTypes: true });
    const fuzzy = entries
      .filter((entry) => entry.isDirectory() && /orchestrator|\bao\b/i.test(entry.name))
      .map((entry) => path.join(toolingRoot, entry.name));

    for (const candidate of fuzzy) {
      if (existsSync(path.join(candidate, AO_CLI))) {
        cachedAoRoot = candidate;
        return candidate;
      }
    }
  } catch {}

  cachedAoRoot = candidates[0];
  return cachedAoRoot;
}

async function runAoCli(args: string[]): Promise<AoRunResult> {
  const command = "node";
  const fullArgs = [AO_CLI, ...args];
  const aoRoot = await resolveAoRoot();

  try {
    const { stdout = "", stderr = "" } = await execFileAsync(command, fullArgs, {
      cwd: aoRoot,
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

async function runAdapter(args: string[], preferredSessionId?: string | null): Promise<AgentOrchestratorResult> {
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
          const run = await runAoCli(input.args);
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
  return runAdapter(["spawn", projectPath, task]);
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
