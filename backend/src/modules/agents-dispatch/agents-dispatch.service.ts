import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { SqliteService } from "../../infra/sqlite/sqlite.service";
import { getForgeSourcePackCatalogEntryFromBackendCwd } from "../../infra/paths/directive-source-packs";

const execFileAsync = promisify(execFile);
const DEFAULT_PROJECT_ID = "mc-operator";
const WORKFLOW = ["objective", "constraints", "execution", "verification", "report"] as const;
const inFlightAgentRuns = new Set<string>();
const inFlightRunDispatches = new Set<string>();

const CODING_TASK_KEYWORDS = [
  "code",
  "implement",
  "fix",
  "bug",
  "refactor",
  "typecheck",
  "lint",
  "test",
  "build",
  "api",
  "route",
  "component",
  "repository",
  "typescript",
  "javascript",
  "python",
  "sql",
];

const PLANNING_TASK_KEYWORDS = ["plan", "roadmap", "scope", "strategy", "design", "architecture"];
const OPS_TASK_KEYWORDS = ["health", "status", "canary", "soak", "probe", "monitor", "logs", "reliability", "alert"];
const INTEGRATION_TASK_KEYWORDS = ["integrate", "integration", "adapter", "bridge", "connector", "tool", "pack", "sync"];

type ExecutionMode = "codex-first" | "hybrid" | "openclaw-first";
type OpenClawRole = "workflow-architect" | "task-orchestrator" | "ops-monitor" | "integration-coordinator";
type AgentBackend = "openclaw" | "agent-orchestrator";
type RunStatus = "active" | "closed" | "archived" | "error" | "closing_pending_cleanup";

interface AgentRow {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  role: string;
  description: string | null;
  executor: string;
  backend: AgentBackend;
  sessionId: string | null;
  status: "active" | "paused";
  area: string | null;
  topics: string[];
  systemPrompt: string;
  model: string | null;
  sourcePack: string;
  sourceRef: string | null;
  workflowProfile: Record<string, unknown>;
  packAssets: Array<Record<string, unknown>>;
  handoffAgentIds: string[];
  chainPolicy: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RunRow {
  id: string;
  userId: string;
  projectId: string;
  branch: string;
  worktreePath: string;
  status: RunStatus;
  metadata: Record<string, unknown>;
}

interface DispatchResult {
  ok: boolean;
  status: number;
  body: string;
  command: string;
  args: string[];
  parsed: Record<string, unknown> | null;
  failureClass: string | null;
  attempts: number;
  totalDurationMs: number;
  modelUsed: string | null;
  fallbackUsed: boolean;
}

export class AgentsDispatchError extends Error {
  reason: string;
  status: number;
  details: Record<string, unknown>;

  constructor(input: {
    message: string;
    reason: string;
    status: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.reason = input.reason;
    this.status = input.status;
    this.details = input.details || {};
  }
}

@Injectable()
export class AgentsDispatchService {
  constructor(private readonly sqlite: SqliteService) {}

  private s(value: unknown) {
    return String(value ?? "").trim();
  }

  private parseJsonObject(value: unknown): Record<string, unknown> {
    if (typeof value !== "string" || !value.trim()) return {};
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
    return {};
  }

  private parseJsonArray(value: unknown): unknown[] {
    if (typeof value !== "string" || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [];
  }

  private stringifyJsonObject(value: Record<string, unknown>) {
    return JSON.stringify(value || {});
  }

  private resolveProjectId(projectId?: unknown) {
    return this.s(projectId) || DEFAULT_PROJECT_ID;
  }

  private resolveExecutionMode(): ExecutionMode {
    const normalized = this.s(process.env.MISSION_CONTROL_EXECUTION_MODE).toLowerCase();
    if (normalized === "hybrid") return "hybrid";
    if (normalized === "openclaw-first") return "openclaw-first";
    return "codex-first";
  }

  private resolveOpenClawControlRole(task: string): OpenClawRole {
    const normalized = task.toLowerCase();
    if (OPS_TASK_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "ops-monitor";
    if (INTEGRATION_TASK_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "integration-coordinator";
    if (PLANNING_TASK_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "workflow-architect";
    return "task-orchestrator";
  }

  private shouldPreferCodexLane(task: string) {
    const normalized = task.toLowerCase();
    const coding = CODING_TASK_KEYWORDS.some((keyword) => normalized.includes(keyword));
    return this.resolveExecutionMode() === "codex-first" && coding;
  }

  private shouldAllowOpenClawFallback(input: { allowOpenClawFallback?: unknown }) {
    if (input.allowOpenClawFallback === undefined) return true;
    return Boolean(input.allowOpenClawFallback);
  }

  private codexFirstLaneHintMessage() {
    return "Codex-first preference: coding task detected. OpenClaw execution remains fully available with no scope limit.";
  }

  private operator() {
    const latest = this.sqlite.connection
      .prepare("SELECT id FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    if (latest) {
      return { id: this.s(latest.id) };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare(
        "INSERT INTO users (id, name, timezone, join_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, "Operator", "Asia/Bangkok", now, now, now);
    return { id };
  }

  private toAgentRow(raw: Record<string, unknown>): AgentRow {
    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      name: this.s(raw.name),
      role: this.s(raw.role) || "builder",
      description: this.s(raw.description) || null,
      executor: this.s(raw.executor) || "openclaw",
      backend: this.s(raw.backend) === "agent-orchestrator" ? "agent-orchestrator" : "openclaw",
      sessionId: this.s(raw.session_id) || null,
      status: this.s(raw.status) === "paused" ? "paused" : "active",
      area: this.s(raw.area) || null,
      topics: this.parseTopics(raw.topics_json),
      systemPrompt: this.s(raw.system_prompt),
      model: this.s(raw.model) || null,
      sourcePack: this.s(raw.source_pack) || "native",
      sourceRef: this.s(raw.source_ref) || null,
      workflowProfile: this.parseJsonObject(raw.workflow_json),
      packAssets: this.parseJsonArray(raw.pack_assets_json)
        .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object")),
      handoffAgentIds: this.parseJsonArray(raw.handoff_agent_ids_json)
        .map((entry) => this.s(entry))
        .filter(Boolean),
      chainPolicy: this.s(raw.chain_policy) || "manual",
      lastRunAt: this.s(raw.last_run_at) || null,
      lastRunStatus: this.s(raw.last_run_status) || null,
      lastRunSummary: this.s(raw.last_run_summary) || null,
      createdAt: this.s(raw.created_at),
      updatedAt: this.s(raw.updated_at),
    };
  }

  private parseTopics(value: unknown) {
    if (typeof value !== "string" || !value.trim()) return [] as string[];
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [] as string[];
      return parsed.map((entry) => this.s(entry)).filter(Boolean);
    } catch {
      return [] as string[];
    }
  }

  private toRunRow(raw: Record<string, unknown>): RunRow {
    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      branch: this.s(raw.branch),
      worktreePath: this.s(raw.worktree_path),
      status: (this.s(raw.status) as RunStatus) || "active",
      metadata: this.parseJsonObject(raw.metadata_json),
    };
  }

  private findAgentById(userId: string, projectId: string, agentId: string) {
    const row = this.sqlite.connection
      .prepare("SELECT * FROM agents WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1")
      .get(userId, projectId, agentId) as Record<string, unknown> | undefined;
    return row ? this.toAgentRow(row) : null;
  }

  private findRunById(userId: string, projectId: string, runId: string) {
    const row = this.sqlite.connection
      .prepare("SELECT * FROM workspace_runs WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1")
      .get(userId, projectId, runId) as Record<string, unknown> | undefined;
    return row ? this.toRunRow(row) : null;
  }

  private hasRunningRunDispatch(userId: string, projectId: string, runId: string) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT id FROM workspace_run_dispatches WHERE user_id = ? AND project_id = ? AND run_id = ? AND status = 'running' LIMIT 1",
      )
      .get(userId, projectId, runId) as Record<string, unknown> | undefined;
    return Boolean(row?.id);
  }

  private createRunDispatch(input: {
    userId: string;
    projectId: string;
    runId: string;
    agentId: string;
    metadata?: Record<string, unknown>;
  }) {
    const row = {
      id: randomUUID(),
      user_id: input.userId,
      project_id: input.projectId,
      run_id: input.runId,
      agent_id: input.agentId,
      session_id: null,
      model: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      status: "running",
      failure_class: null,
      command: null,
      report_id: null,
      artifact_path: null,
      metadata_json: this.stringifyJsonObject(input.metadata || {}),
    };
    this.sqlite.connection
      .prepare(
        "INSERT INTO workspace_run_dispatches (id, user_id, project_id, run_id, agent_id, session_id, model, started_at, finished_at, status, failure_class, command, report_id, artifact_path, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.user_id,
        row.project_id,
        row.run_id,
        row.agent_id,
        row.session_id,
        row.model,
        row.started_at,
        row.finished_at,
        row.status,
        row.failure_class,
        row.command,
        row.report_id,
        row.artifact_path,
        row.metadata_json,
      );
    return { id: row.id, metadata: this.parseJsonObject(row.metadata_json) };
  }

  private updateRunDispatch(
    userId: string,
    projectId: string,
    dispatchId: string,
    updates: {
      status: "success" | "error";
      failureClass: string | null;
      command: string | null;
      reportId: string | null;
      artifactPath: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    this.sqlite.connection
      .prepare(
        "UPDATE workspace_run_dispatches SET finished_at = ?, status = ?, failure_class = ?, command = ?, report_id = ?, artifact_path = ?, metadata_json = ? WHERE user_id = ? AND project_id = ? AND id = ?",
      )
      .run(
        new Date().toISOString(),
        updates.status,
        updates.failureClass,
        updates.command,
        updates.reportId,
        updates.artifactPath,
        this.stringifyJsonObject(updates.metadata || {}),
        userId,
        projectId,
        dispatchId,
      );
  }

  private createReport(input: {
    userId: string;
    projectId: string;
    title: string;
    content: string;
    category: string;
    status: string;
    area: string;
    source: string;
    topics: string[];
    metadata: Record<string, unknown>;
  }) {
    const row = {
      id: randomUUID(),
      user_id: input.userId,
      project_id: input.projectId,
      title: input.title,
      content: input.content,
      category: input.category,
      status: input.status,
      area: input.area,
      linked_quest_id: null,
      source: input.source,
      metadata_json: this.stringifyJsonObject(input.metadata),
      date: new Date().toISOString(),
    };
    this.sqlite.connection
      .prepare(
        "INSERT INTO reports (id, user_id, project_id, title, content, category, status, area, linked_quest_id, source, metadata_json, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.user_id,
        row.project_id,
        row.title,
        row.content,
        row.category,
        row.status,
        row.area,
        row.linked_quest_id,
        row.source,
        row.metadata_json,
        row.date,
      );
    return { id: row.id, date: row.date };
  }

  private updateAgentRun(userId: string, projectId: string, agent: AgentRow, runStatus: string, summary: string) {
    const now = new Date().toISOString();
    this.sqlite.connection
      .prepare(
        "UPDATE agents SET last_run_at = ?, last_run_status = ?, last_run_summary = ?, updated_at = ? WHERE user_id = ? AND project_id = ? AND id = ?",
      )
      .run(now, runStatus, summary.slice(0, 240), now, userId, projectId, agent.id);
    return this.findAgentById(userId, projectId, agent.id);
  }

  private buildReportHref(date: string) {
    const day = date.slice(0, 10);
    return day ? `/dashboard/report?day=${encodeURIComponent(day)}` : "/dashboard/report";
  }

  private normalizeStdout(stdout: string, stderr: string) {
    const lines = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    let parsed: Record<string, unknown> | null = null;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const candidate = lines[index];
      if (!(candidate?.startsWith("{") && candidate.endsWith("}"))) continue;
      try {
        parsed = JSON.parse(candidate) as Record<string, unknown>;
        break;
      } catch {}
    }
    return {
      body: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n").trim(),
      parsed,
    };
  }

  private classifyFailure(status: number, body: string) {
    const lower = body.toLowerCase();
    if (status === 408 || lower.includes("timeout")) return "timeout";
    if (status === 429 || lower.includes("rate limit")) return "rate_limit";
    if (status >= 500 || lower.includes("provider")) return "provider_error";
    if (status === 400 || lower.includes("invalid") || lower.includes("validation")) return "validation_error";
    return "tool_error";
  }

  private async validateOpenClawPreflight() {
    const repairScript = path.join(os.homedir(), ".openclaw", "workspace", "scripts", "repair-openclaw-command.ps1");
    let hasRepair = false;
    try {
      await access(repairScript);
      hasRepair = true;
    } catch {}
    if (!hasRepair) {
      try {
        await execFileAsync("where.exe", ["openclaw"], { windowsHide: true, timeout: 10_000 });
      } catch {
        return {
          ok: false,
          issues: [
            {
              missingPath: "openclaw (CLI executable)",
              whyRequired: "Mission Control dispatch needs OpenClaw CLI when repair script is unavailable.",
              suggestedFix: "Install/repair OpenClaw CLI and ensure it is in PATH, or restore ~/.openclaw/workspace/scripts/repair-openclaw-command.ps1.",
            },
          ],
        };
      }
    }
    return { ok: true, issues: [] as Array<Record<string, string>> };
  }

  private async resolvePowerShellArgs(input: { brief: string; timeoutSeconds: number; thinking: "low" | "medium" | "high" }) {
    const repairScript = path.join(os.homedir(), ".openclaw", "workspace", "scripts", "repair-openclaw-command.ps1");
    try {
      await access(repairScript);
      return [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        repairScript,
        "agent",
        "--agent",
        "main",
        "--message",
        input.brief,
        "--thinking",
        input.thinking,
        "--timeout",
        String(input.timeoutSeconds),
        "--json",
      ];
    } catch {
      return [
        "-Command",
        `openclaw agent --agent "main" --message "${input.brief.replace(/\"/g, '\\"')}" --thinking ${input.thinking} --timeout ${String(input.timeoutSeconds)} --json`,
      ];
    }
  }

  private async dispatchToOpenClaw(input: { brief: string; timeoutSeconds: number; thinking: "low" | "medium" | "high"; fallbackUsed: boolean }): Promise<DispatchResult> {
    const args = await this.resolvePowerShellArgs(input);
    const startedAt = Date.now();
    try {
      const { stdout = "", stderr = "" } = await execFileAsync("powershell.exe", args, {
        windowsHide: true,
        timeout: input.timeoutSeconds * 1000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const normalized = this.normalizeStdout(String(stdout || ""), String(stderr || ""));
      return {
        ok: true,
        status: 200,
        body: normalized.body,
        command: "powershell.exe",
        args,
        parsed: normalized.parsed,
        failureClass: null,
        attempts: 1,
        totalDurationMs: Date.now() - startedAt,
        modelUsed: this.s(process.env.OPENCLAW_MODEL) || this.s(process.env.OPENCLAW_MODEL_PRIMARY) || "default",
        fallbackUsed: input.fallbackUsed,
      };
    } catch (error) {
      const execError = error as Error & { code?: number | string; stdout?: string | Buffer; stderr?: string | Buffer };
      const stdout = Buffer.isBuffer(execError.stdout) ? execError.stdout.toString() : String(execError.stdout || "");
      const stderr = Buffer.isBuffer(execError.stderr) ? execError.stderr.toString() : String(execError.stderr || "");
      const normalized = this.normalizeStdout(stdout, stderr);
      const status = typeof execError.code === "number" && Number.isFinite(execError.code) ? execError.code : 502;
      const body = normalized.body || execError.message || "OpenClaw dispatch failed.";
      return {
        ok: false,
        status,
        body,
        command: "powershell.exe",
        args,
        parsed: normalized.parsed,
        failureClass: this.classifyFailure(status, body),
        attempts: 1,
        totalDurationMs: Date.now() - startedAt,
        modelUsed: this.s(process.env.OPENCLAW_MODEL) || this.s(process.env.OPENCLAW_MODEL_PRIMARY) || "default",
        fallbackUsed: input.fallbackUsed,
      };
    }
  }

  async dispatch(input: {
    projectId?: unknown;
    agentId?: unknown;
    task?: unknown;
    deepMode?: unknown;
    allowOpenClawFallback?: unknown;
    runId?: unknown;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const agentId = this.s(input.agentId);
    const task = this.s(input.task);
    const deepMode = Boolean(input.deepMode);
    const allowOpenClawFallback = this.shouldAllowOpenClawFallback({
      allowOpenClawFallback: input.allowOpenClawFallback,
    });

    if (!agentId) throw new AgentsDispatchError({ message: "Agent ID is required.", reason: "missing_agent_id", status: 400 });
    if (!task) throw new AgentsDispatchError({ message: "Task is required.", reason: "missing_task", status: 400 });

    const agent = this.findAgentById(user.id, projectId, agentId);
    if (!agent) throw new AgentsDispatchError({ message: "Agent not found.", reason: "agent_not_found", status: 404 });
    if (agent.status !== "active") throw new AgentsDispatchError({ message: "Only active agents can be dispatched.", reason: "agent_inactive", status: 400 });
    if (agent.executor !== "openclaw") throw new AgentsDispatchError({ message: "This agent is not configured for direct OpenClaw dispatch.", reason: "unsupported_executor", status: 400 });
    if (agent.backend === "agent-orchestrator") {
      const catalogEntry = getForgeSourcePackCatalogEntryFromBackendCwd(["agent-orchestrator"]);
      if (catalogEntry?.classification !== "live_runtime") {
        throw new AgentsDispatchError({
          message: "agent-orchestrator remains follow-up only; dispatch through the live host surface is blocked.",
          reason: "backend_follow_up_only",
          status: 409,
          details: { catalogEntry },
        });
      }
    }

    const runId = this.s(input.runId) || null;
    let runRow: RunRow | null = null;
    let runContext: { runId: string; worktreePath: string; status: string } | null = null;
    if (runId) {
      runRow = this.findRunById(user.id, projectId, runId);
      if (!runRow) throw new AgentsDispatchError({ message: "Workspace run not found.", reason: "run_not_found", status: 404, details: { code: "workspace_run_not_found" } });
      if (runRow.status !== "active") throw new AgentsDispatchError({ message: "Workspace run is not active.", reason: "run_not_active", status: 409, details: { code: "workspace_run_inactive", artifactPath: runRow.worktreePath } });
      const exists = await stat(runRow.worktreePath).then((info) => info.isDirectory()).catch(() => false);
      if (!exists) throw new AgentsDispatchError({ message: "Workspace run worktree path is missing.", reason: "worktree_path_missing", status: 409, details: { code: "workspace_run_path_missing", artifactPath: runRow.worktreePath } });
      if (this.hasRunningRunDispatch(user.id, projectId, runRow.id) || inFlightRunDispatches.has(runRow.id)) {
        throw new AgentsDispatchError({ message: "Dispatch already running for this run.", reason: "run_dispatch_in_flight", status: 409, details: { code: "run_dispatch_single_flight", artifactPath: runRow.worktreePath } });
      }
      runContext = { runId: runRow.id, worktreePath: runRow.worktreePath, status: runRow.status };
    }

    const preflight = await this.validateOpenClawPreflight();
    if (!preflight.ok) {
      throw new AgentsDispatchError({
        message: "Dispatch blocked by runtime preflight.",
        reason: "missing_path",
        status: 503,
        details: { code: "missing_path", issues: preflight.issues },
      });
    }

    const lockKey = `${projectId}:${agent.id}`;
    if (inFlightAgentRuns.has(lockKey)) {
      throw new AgentsDispatchError({ message: "Duplicate run guard blocked repeated dispatch.", reason: "duplicate_run_guard", status: 409, details: { code: "duplicate_run_guard" } });
    }

    const executionMode = this.resolveExecutionMode();
    const openClawControlRole = this.resolveOpenClawControlRole(task);
    const codexPreferred = this.shouldPreferCodexLane(task);
    const brief = [
      "Workflow",
      ...WORKFLOW.map((stage) => `- ${stage}`),
      "",
      "Objective",
      task,
      "",
      "Execution mode: " + executionMode,
      "OpenClaw role: " + openClawControlRole,
      "allowOpenClawFallback: " + String(allowOpenClawFallback),
      codexPreferred ? this.codexFirstLaneHintMessage() : "",
    ]
      .filter(Boolean)
      .join("\n");
    const score = Math.min(100, Math.round(brief.length / 180) + (deepMode ? 25 : 0));
    const tier = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
    const costRisk = { tier, score, label: `cost-risk/${tier}`, reasons: [deepMode ? "deep mode enabled" : "short brief mode", `${brief.length} chars total brief length`] };

    const runDispatchRecord = runContext
      ? this.createRunDispatch({
          userId: user.id,
          projectId,
          runId: runContext.runId,
          agentId: agent.id,
          metadata: { startedBy: "agents.dispatch", startedAt: new Date().toISOString(), runContext },
        })
      : null;

    inFlightAgentRuns.add(lockKey);
    if (runContext) inFlightRunDispatches.add(runContext.runId);

    try {
      const dispatch = await this.dispatchToOpenClaw({
        brief: codexPreferred ? `${this.codexFirstLaneHintMessage()}\n\n${brief}` : brief,
        timeoutSeconds: 180,
        thinking: "medium",
        fallbackUsed: false,
      });
      const summary = dispatch.ok ? "Task sent to OpenClaw." : `Dispatch failed (${dispatch.status}).`;
      const updatedAgent = this.updateAgentRun(user.id, projectId, agent, dispatch.ok ? (agent.backend === "agent-orchestrator" ? "running" : "dispatched") : "error", summary);

      const report = this.createReport({
        userId: user.id,
        projectId,
        title: dispatch.ok ? `Agent dispatched: ${agent.name}` : `Agent dispatch failed: ${agent.name}`,
        content: `Command: ${dispatch.command}\nStatus: ${dispatch.status}\nExecution mode: ${executionMode}\nOpenClaw role: ${openClawControlRole}\n\nTask:\n${task}\n\nResponse:\n${dispatch.body || "(empty)"}`,
        category: dispatch.ok ? "task" : "error",
        status: dispatch.ok ? "info" : "error",
        area: agent.area || "agents",
        source: "Mission Control",
        topics: [...agent.topics, "agents", "openclaw", agent.role],
        metadata: {
          endpoint: "/api/agents/[id]/dispatch",
          source: "agents.dispatch",
          failure_class: dispatch.failureClass,
          attempts: dispatch.attempts,
          total_duration_ms: dispatch.totalDurationMs,
          model_used: dispatch.modelUsed,
          fallback_used: dispatch.fallbackUsed,
          success: dispatch.ok,
          executionMode,
          openClawControlRole,
          allowOpenClawFallback,
          codexPreferred,
          runContext,
        },
      });

      if (runDispatchRecord) {
        this.updateRunDispatch(user.id, projectId, runDispatchRecord.id, {
          status: dispatch.ok ? "success" : "error",
          failureClass: dispatch.ok ? null : dispatch.failureClass || "dispatch_error",
          command: `${dispatch.command} ${dispatch.args.join(" ")}`.trim(),
          reportId: report.id,
          artifactPath: runContext?.worktreePath || null,
          metadata: { ...(runDispatchRecord.metadata || {}), dispatchStatus: dispatch.status, runContext },
        });
      }

      if (runRow && runContext) {
        const metadata = {
          ...runRow.metadata,
          lastDispatchAt: new Date().toISOString(),
          lastDispatchStatus: dispatch.ok ? "success" : "error",
          lastDispatchReportId: report.id,
        };
        this.sqlite.connection
          .prepare("UPDATE workspace_runs SET metadata_json = ? WHERE user_id = ? AND project_id = ? AND id = ?")
          .run(this.stringifyJsonObject(metadata), user.id, projectId, runRow.id);
      }

      if (!dispatch.ok) {
        throw new AgentsDispatchError({
          message: "Agent dispatch failed.",
          reason: "dispatch_failed",
          status: 502,
          details: {
            msg: "Agent dispatch failed.",
            agent: updatedAgent,
            run: {
              summary: `Dispatch failed with status ${dispatch.status}.`,
              brief,
              reportHref: this.buildReportHref(report.date),
              reportId: report.id,
              handoffs: [],
              workflow: WORKFLOW,
              costRisk,
              deepMode,
              evalGuard: { status: "unavailable", promotionStatus: "ready", reasons: ["backend_migrated_dispatch"], metrics: { score: 0, failureRate: 0, costUsd: 0, total: 0 } },
              promotionStatus: "ready",
              evalGuardWarning: null,
              failureClass: dispatch.failureClass || null,
              attempts: dispatch.attempts,
              totalDurationMs: dispatch.totalDurationMs,
              modelUsed: dispatch.modelUsed || null,
              fallbackUsed: dispatch.fallbackUsed,
              executionMode,
              openClawControlRole,
              allowOpenClawFallback,
              codexPreferred,
              runContext,
            },
          },
        });
      }

      return {
        msg: "Agent dispatched.",
        agent: updatedAgent,
        run: {
          summary: `Task dispatched. Result: ${summary}`,
          brief,
          reportHref: this.buildReportHref(report.date),
          reportId: report.id,
          handoffs: [],
          workflow: WORKFLOW,
          costRisk,
          deepMode,
          evalGuard: { status: "unavailable", promotionStatus: "ready", reasons: ["backend_migrated_dispatch"], metrics: { score: 0, failureRate: 0, costUsd: 0, total: 0 } },
          promotionStatus: "ready",
          evalGuardWarning: null,
          failureClass: null,
          attempts: dispatch.attempts,
          totalDurationMs: dispatch.totalDurationMs,
          modelUsed: dispatch.modelUsed || null,
          fallbackUsed: dispatch.fallbackUsed,
          executionMode,
          openClawControlRole,
          allowOpenClawFallback,
          codexPreferred,
          runContext,
        },
      };
    } finally {
      inFlightAgentRuns.delete(lockKey);
      if (runContext) inFlightRunDispatches.delete(runContext.runId);
    }
  }
}
