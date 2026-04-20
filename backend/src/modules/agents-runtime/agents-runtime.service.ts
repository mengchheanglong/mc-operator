import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { SqliteService } from "../../infra/sqlite/sqlite.service";
import {
  getForgeSourcePackCatalogEntryFromBackendCwd,
  resolveAgentOrchestratorRootFromBackendCwd,
} from "../../infra/paths/directive-source-packs";

const execFileAsync = promisify(execFile);
const DEFAULT_PROJECT_ID = "mc-operator";
const AO_CLI_ENTRY = path.join("packages", "cli", "dist", "index.js");

type AgentStatus = "active" | "paused";
type AgentBackend = "openclaw" | "agent-orchestrator";

interface AgentRow {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  role: string;
  executor: string;
  backend: AgentBackend;
  sessionId: string | null;
  status: AgentStatus;
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

export interface AgentOrchestratorResult {
  ok: boolean;
  status: number;
  body: string;
  command: string;
  args: string[];
  sessionId: string | null;
  sessionIds: string[];
  parsed: Record<string, unknown> | null;
}

export class AgentsRuntimeError extends Error {
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
export class AgentsRuntimeService {
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

  private resolveProjectId(projectId?: unknown) {
    return this.s(projectId) || DEFAULT_PROJECT_ID;
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
      executor: this.s(raw.executor) || "openclaw",
      backend: this.s(raw.backend) === "agent-orchestrator" ? "agent-orchestrator" : "openclaw",
      sessionId: this.s(raw.session_id) || null,
      status: this.s(raw.status) === "paused" ? "paused" : "active",
      area: this.s(raw.area) || null,
      topics: this.parseJsonArray(raw.topics_json)
        .map((entry) => this.s(entry))
        .filter(Boolean),
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

  private findAgentById(userId: string, projectId: string, agentId: string) {
    const row = this.sqlite.connection
      .prepare("SELECT * FROM agents WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1")
      .get(userId, projectId, agentId) as Record<string, unknown> | undefined;
    return row ? this.toAgentRow(row) : null;
  }

  private updateAgent(
    userId: string,
    projectId: string,
    agentId: string,
    updates: {
      sessionId?: string | null;
      status?: AgentStatus;
    },
  ) {
    const fields: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];
    if (updates.sessionId !== undefined) {
      fields.push("session_id = ?");
      params.push(updates.sessionId);
    }
    if (updates.status !== undefined) {
      fields.push("status = ?");
      params.push(updates.status);
    }
    params.push(userId, projectId, agentId);

    this.sqlite.connection
      .prepare(
        `UPDATE agents SET ${fields.join(", ")} WHERE user_id = ? AND project_id = ? AND id = ?`,
      )
      .run(...params);

    return this.findAgentById(userId, projectId, agentId);
  }

  private resolveWorkspaceRoot() {
    if (process.env.OPENCLAW_WORKSPACE_ROOT?.trim()) {
      return path.resolve(process.env.OPENCLAW_WORKSPACE_ROOT.trim());
    }
    return path.resolve(process.cwd(), "..", "..");
  }

  private resolveAoCliEntry() {
    const aoRoot = resolveAgentOrchestratorRootFromBackendCwd();
    const candidates = [path.join(aoRoot, AO_CLI_ENTRY)];
    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]!;
  }

  private parseAoBody(body: string): Record<string, unknown> | null {
    const lines = String(body || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return null;
    const parsed: Record<string, unknown> = {};

    for (const line of lines) {
      const match = line.match(/^([a-zA-Z][\w .-]{1,40})\s*:\s*(.+)$/);
      if (!match) continue;
      const key = match[1]!
        .trim()
        .toLowerCase()
        .replace(/[\s.-]+/g, "_");
      const value = match[2]!.trim();
      if (!parsed[key]) parsed[key] = value;
    }

    const sessionIds = this.extractAoSessionIds(body);
    if (sessionIds.length > 0) {
      parsed.sessionIds = sessionIds;
    }

    return Object.keys(parsed).length > 0 ? parsed : null;
  }

  private extractAoSessionIds(text: string) {
    const source = String(text || "");
    if (!source.trim()) return [] as string[];
    const values = new Set<string>();

    const uuidRegex =
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
    for (const match of source.matchAll(uuidRegex)) {
      const value = this.s(match[0]);
      if (value) values.add(value);
    }

    const tokenRegex = /\b[a-z]{1,4}[0-9a-z]{2,}(?:-[0-9a-z]{1,8})?\b/gi;
    for (const match of source.matchAll(tokenRegex)) {
      const value = this.s(match[0]);
      if (value && value.length >= 6 && !value.startsWith("http")) {
        values.add(value);
      }
    }

    return Array.from(values);
  }

  private async runAo(
    args: string[],
    preferredSessionId?: string | null,
  ): Promise<AgentOrchestratorResult> {
    let cliEntry: string;
    try {
      cliEntry = this.resolveAoCliEntry();
    } catch (error) {
      return {
        ok: false,
        status: 503,
        body: String((error as Error)?.message || "agent-orchestrator source pack inactive"),
        command: "node",
        args: [AO_CLI_ENTRY, ...args],
        sessionId: this.s(preferredSessionId) || null,
        sessionIds: [],
        parsed: null,
      };
    }
    if (!fs.existsSync(cliEntry)) {
      return {
        ok: false,
        status: 502,
        body: `agent-orchestrator cli not found: ${cliEntry}`,
        command: "node",
        args: [cliEntry, ...args],
        sessionId: this.s(preferredSessionId) || null,
        sessionIds: [],
        parsed: null,
      };
    }

    const command = "node";
    const fullArgs = [cliEntry, ...args];
    const aoRoot = path.resolve(cliEntry, "..", "..", "..", "..");

    try {
      const { stdout = "", stderr = "" } = await execFileAsync(command, fullArgs, {
        cwd: aoRoot,
        windowsHide: true,
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const body = [String(stdout || "").trim(), String(stderr || "").trim()]
        .filter(Boolean)
        .join("\n\n");
      const sessionIds = this.extractAoSessionIds(body);
      const sessionId = this.s(preferredSessionId) || sessionIds[0] || null;
      return {
        ok: true,
        status: 200,
        body,
        command,
        args: fullArgs,
        sessionId,
        sessionIds,
        parsed: this.parseAoBody(body),
      };
    } catch (error) {
      const execError = error as Error & {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        code?: number | string;
      };
      const stdout = Buffer.isBuffer(execError.stdout)
        ? execError.stdout.toString()
        : String(execError.stdout || "");
      const stderr = Buffer.isBuffer(execError.stderr)
        ? execError.stderr.toString()
        : String(execError.stderr || "");
      const body = [stdout.trim(), stderr.trim(), execError.message].filter(Boolean).join("\n\n");
      const sessionIds = this.extractAoSessionIds(body);
      const sessionId = this.s(preferredSessionId) || sessionIds[0] || null;
      return {
        ok: false,
        status: typeof execError.code === "number" ? execError.code : 502,
        body,
        command,
        args: fullArgs,
        sessionId,
        sessionIds,
        parsed: this.parseAoBody(body),
      };
    }
  }

  private resolveActiveAoAgent(projectId: string, agentId: string) {
    const user = this.operator();
    const agent = this.findAgentById(user.id, projectId, agentId);
    if (!agent) {
      throw new AgentsRuntimeError({
        message: "Agent not found.",
        reason: "agent_not_found",
        status: 404,
      });
    }
    if (agent.backend !== "agent-orchestrator") {
      throw new AgentsRuntimeError({
        message: "Endpoint is only supported for agent-orchestrator agents.",
        reason: "unsupported_backend",
        status: 400,
      });
    }
    const catalogEntry = getForgeSourcePackCatalogEntryFromBackendCwd(["agent-orchestrator"]);
    if (catalogEntry?.classification !== "live_runtime") {
      throw new AgentsRuntimeError({
        message: "agent-orchestrator remains follow-up only; interactive host runtime endpoints are blocked.",
        reason: "backend_follow_up_only",
        status: 409,
        details: { catalogEntry },
      });
    }
    return { userId: user.id, agent };
  }

  async getStatus(input: {
    projectId?: unknown;
    agentId?: unknown;
    includeSessions?: boolean;
  }) {
    const projectId = this.resolveProjectId(input.projectId);
    const agentId = this.s(input.agentId);
    if (!agentId) {
      throw new AgentsRuntimeError({
        message: "Agent ID is required.",
        reason: "missing_agent_id",
        status: 400,
      });
    }

    const { agent } = this.resolveActiveAoAgent(projectId, agentId);

    const status = agent.sessionId
      ? await this.runAo(["status", agent.sessionId], agent.sessionId)
      : {
          ok: true,
          status: 200,
          body: "No active orchestrator session.",
          command: "node",
          args: [],
          sessionId: null,
          sessionIds: [],
          parsed: { state: "idle", reason: "session_missing" },
        };

    const sessions = input.includeSessions ? await this.runAo(["session", "ls"]) : null;
    return { agent, status, sessions };
  }

  async killSession(input: { projectId?: unknown; agentId?: unknown }) {
    const projectId = this.resolveProjectId(input.projectId);
    const agentId = this.s(input.agentId);
    if (!agentId) {
      throw new AgentsRuntimeError({
        message: "Agent ID is required.",
        reason: "missing_agent_id",
        status: 400,
      });
    }

    const { userId, agent } = this.resolveActiveAoAgent(projectId, agentId);
    const killResult = agent.sessionId
      ? await this.runAo(["session", "kill", agent.sessionId], agent.sessionId)
      : null;

    const updated = this.updateAgent(userId, projectId, agentId, {
      sessionId: null,
      status: "paused",
    });

    return {
      msg: "Agent session cleared and agent paused.",
      agent: updated,
      killResult,
    };
  }

  async restoreSession(input: { projectId?: unknown; agentId?: unknown }) {
    const projectId = this.resolveProjectId(input.projectId);
    const agentId = this.s(input.agentId);
    if (!agentId) {
      throw new AgentsRuntimeError({
        message: "Agent ID is required.",
        reason: "missing_agent_id",
        status: 400,
      });
    }

    const { userId, agent } = this.resolveActiveAoAgent(projectId, agentId);
    if (!agent.sessionId) {
      throw new AgentsRuntimeError({
        message: "This agent does not have a session ID to restore.",
        reason: "session_missing",
        status: 400,
      });
    }

    const result = await this.runAo(["session", "restore", agent.sessionId], agent.sessionId);
    if (!result.ok) {
      throw new AgentsRuntimeError({
        message: "Unable to restore session.",
        reason: "restore_failed",
        status: 502,
        details: { result },
      });
    }

    const updated = this.updateAgent(userId, projectId, agentId, {
      sessionId: result.sessionId || agent.sessionId,
      status: "active",
    });

    return {
      msg: "Agent session restored.",
      agent: updated,
      result,
    };
  }
}
