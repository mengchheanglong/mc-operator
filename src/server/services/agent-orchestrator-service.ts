import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { getWorkspaceRootPath } from "@/server/projects/workspace-projects";

const execFileAsync = promisify(execFile);

export interface AgentOrchestratorResult {
  ok: boolean;
  status: number;
  body: string;
  command: string;
  args: string[];
  sessionId: string | null;
}

const AO_ROOT = path.join(getWorkspaceRootPath(), "agent-lab", "tooling", "agent-orchestrator");
const AO_CLI = "packages/cli/dist/index.js";

async function runAo(args: string[]) {
  const command = "node";
  const fullArgs = [AO_CLI, ...args];

  try {
    const { stdout = "", stderr = "" } = await execFileAsync(command, fullArgs, {
      cwd: AO_ROOT,
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 4,
    });
    return {
      ok: true,
      status: 200,
      body: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n"),
      command,
      args: fullArgs,
    };
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string; code?: number | string; message: string };
    return {
      ok: false,
      status: typeof execError.code === "number" ? execError.code : 500,
      body: [execError.stdout?.trim() || "", execError.stderr?.trim() || "", execError.message].filter(Boolean).join("\n\n"),
      command,
      args: fullArgs,
    };
  }
}

export async function spawnAgentOrchestratorRun(projectPath: string, task: string): Promise<AgentOrchestratorResult> {
  const run = await runAo(["spawn", projectPath, task]);
  const sessionIdMatch = run.body.match(/session[:\s]+([a-zA-Z0-9_-]+)/i);
  return {
    ...run,
    sessionId: sessionIdMatch ? sessionIdMatch[1] : null,
  };
}

export async function getAgentOrchestratorStatus(sessionId?: string | null): Promise<AgentOrchestratorResult> {
  const run = await runAo(sessionId ? ["status", sessionId] : ["status"]);
  return {
    ...run,
    sessionId: sessionId || null,
  };
}

export async function sendAgentOrchestratorMessage(sessionId: string, message: string): Promise<AgentOrchestratorResult> {
  const run = await runAo(["send", sessionId, message]);
  return {
    ...run,
    sessionId,
  };
}
