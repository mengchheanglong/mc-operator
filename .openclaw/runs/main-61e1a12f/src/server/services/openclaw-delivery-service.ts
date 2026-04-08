import { access } from "fs/promises";
import { constants as fsConstants } from "fs";
import { execFile } from "child_process";
import os from "os";
import path from "path";
import { promisify } from "util";
import { buildTelegramChunkPlan } from "@/server/services/telegram-send-guard";
import Database from "better-sqlite3";
import { decideRouteModel, evaluateReliability, type ReliabilitySample } from "@/server/services/reliability-ops-service";
import { createReport } from "@/server/repositories/reports-repo";
import { findOrCreateUser } from "@/server/repositories/users-repo";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";

const execFileAsync = promisify(execFile);

export type DispatchFailureClass =
  | "timeout"
  | "rate_limit"
  | "provider_error"
  | "tool_error"
  | "validation_error";

export interface OpenClawDeliveryResult {
  ok: boolean;
  status: number;
  body: string;
  command: string;
  args: string[];
  parsed: Record<string, unknown> | null;
  agentId: string;
  failureClass: DispatchFailureClass | null;
  attempts: number;
  totalDurationMs: number;
  modelUsed: string;
  fallbackUsed: boolean;
  routeDecisionMetadata?: Record<string, unknown>;
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

export interface OpenClawPreflightIssue {
  missingPath: string;
  whyRequired: string;
  suggestedFix: string;
}

export interface OpenClawPreflightResult {
  ok: boolean;
  issues: OpenClawPreflightIssue[];
}

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envBool(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function resolveRepairScriptPath() {
  return path.join(os.homedir(), ".openclaw", "workspace", "scripts", "repair-openclaw-command.ps1");
}

function resolveAgentId() {
  return process.env.OPENCLAW_AGENT_ID?.trim() || "main";
}

function resolveModelUsed() {
  return process.env.OPENCLAW_MODEL?.trim() || process.env.OPENCLAW_MODEL_PRIMARY?.trim() || "default";
}

let lastRouteDecisionKey: string | null = null;

function readRecentReliabilitySamples(limit: number): ReliabilitySample[] {
  const dbPath = path.resolve(process.env.SQLITE_PATH || path.join(process.cwd(), "data", "openclaw.db"));
  const sqlite = new Database(dbPath, { readonly: true });
  const rows = sqlite
    .prepare("SELECT id, date, metadata_json FROM reports ORDER BY date DESC, id DESC LIMIT ?")
    .all(limit * 8) as Array<{ id: string; date: string; metadata_json: string | null }>;
  sqlite.close();

  return rows
    .map((row) => {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : {};
      } catch {}
      return {
        id: row.id,
        timestamp: row.date,
        totalDurationMs: Number(metadata.totalDurationMs ?? metadata.total_duration_ms ?? 0),
        failureClass: String(metadata.failureClass ?? metadata.failure_class ?? "") || null,
        fallbackUsed: Boolean(metadata.fallbackUsed ?? metadata.fallback_used),
      } satisfies ReliabilitySample;
    })
    .filter((sample) => sample.totalDurationMs || sample.failureClass || sample.fallbackUsed)
    .slice(0, limit);
}

function resolveRouteDecision() {
  const limit = Math.max(5, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_RUN_LIMIT", 20)));
  const samples = readRecentReliabilitySamples(limit);
  const summary = evaluateReliability(samples, {
    minSamples: Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_MIN_SAMPLES", 20))),
    maxTimeoutRate: envNum("MISSION_CONTROL_RELIABILITY_MAX_TIMEOUT_RATE", 0.2),
    maxFailoverRate: envNum("MISSION_CONTROL_RELIABILITY_MAX_FAILOVER_RATE", 0.5),
    maxToolErrorRate: envNum("MISSION_CONTROL_RELIABILITY_MAX_TOOL_ERROR_RATE", 0.1),
    maxAvgDurationMs: Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_MAX_AVG_DURATION_MS", 120000))),
  });

  const decision = decideRouteModel({
    summary,
    enabled: envBool("MISSION_CONTROL_AUTO_ROUTE_TUNING_ENABLED", true),
    minSample: Math.max(1, Math.floor(envNum("MISSION_CONTROL_ROUTE_TUNING_MIN_SAMPLE", 20))),
    degradationThreshold: envNum("MISSION_CONTROL_ROUTE_TUNING_DEGRADATION_THRESHOLD", 0.25),
    primaryModel: process.env.OPENCLAW_MODEL_PRIMARY?.trim() || resolveModelUsed(),
    fallbackModel: process.env.OPENCLAW_MODEL_FALLBACK?.trim() || resolveModelUsed(),
  });

  const routeDecisionKey = `${decision.selectedModel}:${decision.reason}`;
  if (routeDecisionKey !== lastRouteDecisionKey) {
    lastRouteDecisionKey = routeDecisionKey;
    try {
      const user = findOrCreateUser();
      createReport(user.id, getControlPlaneProjectId(), {
        title: "Route policy decision updated",
        content: `Model route switched to ${decision.selectedModel} (${decision.reason}).`,
        category: "maintenance",
        status: "info",
        area: "runtime-reliability",
        topics: ["routing", "reliability"],
        source: "openclaw-delivery",
        metadata: {
          routeDecision: decision,
          reliabilitySummary: summary,
        },
      });
    } catch {}
  }

  return decision;
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

function classifyFailure(status: number, body: string): DispatchFailureClass {
  const lower = body.toLowerCase();

  if (
    status === 408 ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborted")
  ) {
    return "timeout";
  }

  if (status === 429 || lower.includes("rate limit") || lower.includes("too many requests")) {
    return "rate_limit";
  }

  if (status >= 500 || lower.includes("provider") || lower.includes("server error")) {
    return "provider_error";
  }

  if (status === 400 || lower.includes("invalid") || lower.includes("validation")) {
    return "validation_error";
  }

  return "tool_error";
}

function isTransientFailure(failureClass: DispatchFailureClass, status: number) {
  if (failureClass === "timeout" || failureClass === "rate_limit" || failureClass === "provider_error") {
    return true;
  }
  return status >= 500;
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

let preflightCache: { expiresAt: number; value: OpenClawPreflightResult } | null = null;

export async function validateOpenClawPreflightPaths(): Promise<OpenClawPreflightResult> {
  const now = Date.now();
  if (preflightCache && preflightCache.expiresAt > now) {
    return preflightCache.value;
  }

  const issues: OpenClawPreflightIssue[] = [];
  const repairScript = resolveRepairScriptPath();
  const reportsRepoPath = path.join(process.cwd(), "src", "server", "repositories", "reports-repo.ts");
  const reportServiceCompatPath = path.join(process.cwd(), "src", "server", "services", "report-service.ts");

  let hasRepairScript = false;
  try {
    await access(repairScript, fsConstants.F_OK);
    hasRepairScript = true;
  } catch {
    hasRepairScript = false;
  }

  if (!hasRepairScript) {
    try {
      await execFileAsync("where.exe", ["openclaw"], { windowsHide: true, timeout: 10_000 });
    } catch {
      issues.push({
        missingPath: "openclaw (CLI executable)",
        whyRequired: "Mission Control dispatch needs OpenClaw CLI when repair script is unavailable.",
        suggestedFix: "Install/repair OpenClaw CLI and ensure it is in PATH, or restore ~/.openclaw/workspace/scripts/repair-openclaw-command.ps1.",
      });
    }
  }

  let hasReportPath = false;
  try {
    await access(reportsRepoPath, fsConstants.F_OK);
    hasReportPath = true;
  } catch {
    hasReportPath = false;
  }

  if (!hasReportPath) {
    try {
      await access(reportServiceCompatPath, fsConstants.F_OK);
      hasReportPath = true;
    } catch {
      hasReportPath = false;
    }
  }

  if (!hasReportPath) {
    issues.push({
      missingPath: `${reportsRepoPath} (or ${reportServiceCompatPath})`,
      whyRequired: "Dispatch/report runtime needs report repository compatibility path after service path moves.",
      suggestedFix: "Restore src/server/repositories/reports-repo.ts or add src/server/services/report-service.ts compatibility shim.",
    });
  }

  const value: OpenClawPreflightResult = { ok: issues.length === 0, issues };
  preflightCache = { expiresAt: now + 30_000, value };
  return value;
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
  const telegramLimit = Math.max(256, Math.floor(envNum("MISSION_CONTROL_TELEGRAM_MESSAGE_LIMIT", 4096)));
  const guardedMessagePlan = buildTelegramChunkPlan(input.brief, { limit: telegramLimit, maxChunks: 6 });
  const guardedInput: OpenClawDispatchInput = {
    ...input,
    brief: guardedMessagePlan.chunks.join("\n\n---\n\n"),
  };
  const args = await resolvePowerShellArgs(guardedInput, agentId);

  const maxAttempts = Math.max(1, Math.floor(envNum("MISSION_CONTROL_OPENCLAW_MAX_ATTEMPTS", 3)));
  const hardTimeoutBudgetMs = Math.max(30_000, Math.floor(envNum("MISSION_CONTROL_OPENCLAW_HARD_TIMEOUT_BUDGET_MS", 240_000)));
  const attemptTimeoutMs = Math.max(5_000, Math.floor(envNum("MISSION_CONTROL_OPENCLAW_ATTEMPT_TIMEOUT_MS", 90_000)));
  const backoffBaseMs = Math.max(100, Math.floor(envNum("MISSION_CONTROL_OPENCLAW_BACKOFF_BASE_MS", 750)));
  const routeDecision = resolveRouteDecision();
  const modelUsed = routeDecision.selectedModel;

  const startedAt = Date.now();
  let attempts = 0;
  let fallbackUsed = guardedMessagePlan.summarized;
  let lastFailureClass: DispatchFailureClass | null = null;
  let lastStatus = 500;
  let lastBody = "OpenClaw dispatch failed.";
  let lastParsed: Record<string, unknown> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = hardTimeoutBudgetMs - elapsedMs;

    if (remainingMs <= 0) {
      lastFailureClass = "timeout";
      lastStatus = 408;
      lastBody = "OpenClaw dispatch stopped after hard timeout budget.";
      break;
    }

    const thisAttemptTimeoutMs = Math.max(1_000, Math.min(attemptTimeoutMs, remainingMs));

    try {
      const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
        timeout: thisAttemptTimeoutMs,
        env: { ...process.env, OPENCLAW_MODEL: modelUsed },
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
        failureClass: null,
        attempts,
        totalDurationMs: Date.now() - startedAt,
        modelUsed,
        fallbackUsed,
        routeDecisionMetadata: routeDecision.metadata,
      };
    } catch (error) {
      const execError = error as Error & {
        code?: number | string;
        stdout?: string;
        stderr?: string;
        message: string;
        signal?: string;
        killed?: boolean;
      };
      const { body, parsed } = normalizeStdout(execError.stdout || "", execError.stderr || "");
      const status =
        typeof execError.code === "number" && Number.isFinite(execError.code)
          ? execError.code
          : execError.killed || execError.signal === "SIGTERM"
            ? 408
            : 500;

      const failureClass = classifyFailure(status, body || execError.message || "");

      lastFailureClass = failureClass;
      lastStatus = status;
      lastBody = body || execError.message || "OpenClaw dispatch failed.";
      lastParsed = parsed;

      const transient = isTransientFailure(failureClass, status);
      if (!transient || attempt >= maxAttempts) {
        break;
      }

      if (!fallbackUsed && input.thinking && input.thinking !== "low" && attempt >= 2) {
        fallbackUsed = true;
      }

      const backoffMs = Math.min(8_000, backoffBaseMs * 2 ** (attempt - 1));
      await sleep(backoffMs);
    }
  }

  return {
    ok: false,
    status: lastStatus,
    body: lastBody,
    command,
    args,
    parsed: lastParsed,
    agentId,
    failureClass: lastFailureClass,
    attempts,
    totalDurationMs: Date.now() - startedAt,
    modelUsed,
    fallbackUsed,
    routeDecisionMetadata: routeDecision.metadata,
  };
}
