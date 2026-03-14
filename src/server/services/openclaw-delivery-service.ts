import { access } from "fs/promises";
import { constants as fsConstants } from "fs";
import { execFile } from "child_process";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface OpenClawDeliveryResult {
  ok: boolean;
  status: number;
  body: string;
  command: string;
  args: string[];
  parsed: Record<string, unknown> | null;
  agentId: string;
}

interface OpenClawDispatchInput {
  brief: string;
  timeoutSeconds?: number;
  thinking?: "off" | "minimal" | "low" | "medium" | "high";
}

interface OpenClawProbeInput {
  timeoutSeconds?: number;
}

export interface OpenClawProbeResult {
  ok: boolean;
  status: number;
  body: string;
  command: string;
  args: string[];
  agentId: string;
}

function resolveRepairScriptPath() {
  return path.join(os.homedir(), ".openclaw", "workspace", "scripts", "repair-openclaw-command.ps1");
}

function resolveAgentId() {
  return process.env.OPENCLAW_AGENT_ID?.trim() || "main";
}

async function resolvePowerShellArgs(input: OpenClawDispatchInput, agentId: string) {
  const repairScript = resolveRepairScriptPath();

  try {
    await access(repairScript, fsConstants.F_OK);
    return [
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      repairScript,
      "agent",
      "--agent",
      agentId,
      "--message",
      input.brief,
      "--thinking",
      input.thinking ?? "medium",
      "--timeout",
      String(input.timeoutSeconds ?? 180),
      "--json",
    ];
  } catch {
    return [
      "-Command",
      `openclaw agent --agent \"${agentId}\" --message \"${input.brief.replace(/\"/g, '\\\"')}\" --thinking ${input.thinking ?? "medium"} --timeout ${String(input.timeoutSeconds ?? 180)} --json`,
    ];
  }
}

async function resolveProbePowerShellArgs(agentId: string) {
  const repairScript = resolveRepairScriptPath();

  try {
    await access(repairScript, fsConstants.F_OK);
    return ["-ExecutionPolicy", "Bypass", "-File", repairScript, "agent", "--help"];
  } catch {
    return ["-Command", "openclaw agent --help"];
  }
}

function normalizeStdout(stdout: string, stderr: string) {
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();
  const lines = trimmedStdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let parsed: Record<string, unknown> | null = null;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index];
    if (!(candidate.startsWith("{") && candidate.endsWith("}"))) continue;
    try {
      parsed = JSON.parse(candidate) as Record<string, unknown>;
      break;
    } catch {
      continue;
    }
  }

  const body = [trimmedStdout, trimmedStderr].filter(Boolean).join("\n\n").trim();
  return { body, parsed };
}

export async function probeOpenClawAgent(
  input: OpenClawProbeInput = {},
): Promise<OpenClawProbeResult> {
  const command = "powershell.exe";
  const agentId = resolveAgentId();
  const args = await resolveProbePowerShellArgs(agentId);

  try {
    const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
      windowsHide: true,
      timeout: (input.timeoutSeconds ?? 12) * 1000,
      maxBuffer: 1024 * 1024 * 2,
    });
    const body = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n").trim();

    return {
      ok: true,
      status: 200,
      body: body || "OpenClaw CLI is available.",
      command,
      args,
      agentId,
    };
  } catch (error) {
    const execError = error as Error & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message: string;
    };
    const body = [execError.stdout?.trim() || "", execError.stderr?.trim() || ""]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    return {
      ok: false,
      status:
        typeof execError.code === "number" && Number.isFinite(execError.code)
          ? execError.code
          : 503,
      body: body || execError.message || "OpenClaw CLI probe failed.",
      command,
      args,
      agentId,
    };
  }
}

export async function dispatchToOpenClawAgent(
  input: OpenClawDispatchInput,
): Promise<OpenClawDeliveryResult> {
  const command = "powershell.exe";
  const agentId = resolveAgentId();
  const args = await resolvePowerShellArgs(input, agentId);

  try {
    const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
    });
    const { body, parsed } = normalizeStdout(stdout, stderr);

    return {
      ok: true,
      status: 200,
      body,
      command,
      args,
      parsed,
      agentId,
    };
  } catch (error) {
    const execError = error as Error & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message: string;
    };
    const { body, parsed } = normalizeStdout(execError.stdout || "", execError.stderr || "");

    return {
      ok: false,
      status:
        typeof execError.code === "number" && Number.isFinite(execError.code)
          ? execError.code
          : 500,
      body: body || execError.message || "OpenClaw dispatch failed.",
      command,
      args,
      parsed,
      agentId,
    };
  }
}
