import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { SqliteService } from "../../infra/sqlite/sqlite.service";
import {
  getForgeSourcePackCatalogEntryFromBackendCwd,
  resolveAgentOrchestratorRootFromBackendCwd,
} from "../../infra/paths/directive-source-packs";

const execFileAsync = promisify(execFile);
const DEFAULT_PROJECT_ID = "mission-control";
const AO_CLI_ENTRY = path.join("packages", "cli", "dist", "index.js");

type AgentBackend = "openclaw" | "agent-orchestrator";

interface AgentPackAsset {
  label: string;
  path: string;
  kind: "file" | "directory";
}

interface AgentRow {
  id: string;
  userId: string;
  projectId: string;
  backend: AgentBackend;
  sessionId: string | null;
  packAssets: AgentPackAsset[];
}

interface AgentOrchestratorResult {
  ok: boolean;
  status: number;
  body: string;
  command: string;
  args: string[];
  sessionId: string | null;
  sessionIds: string[];
  parsed: Record<string, unknown> | null;
}

export class AgentsExtrasError extends Error {
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
export class AgentsExtrasService {
  constructor(private readonly sqlite: SqliteService) {}

  private s(value: unknown) {
    return String(value ?? "").trim();
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
    const packAssets = this.parseJsonArray(raw.pack_assets_json)
      .filter(
        (row): row is { label?: unknown; path: unknown; kind?: unknown } =>
          Boolean(row && typeof row === "object" && this.s((row as { path?: unknown }).path)),
      )
      .map((row) => ({
        label: this.s(row.label || row.path).slice(0, 120),
        path: this.s(row.path),
        kind: (this.s(row.kind) === "directory" ? "directory" : "file") as AgentPackAsset["kind"],
      }))
      .slice(0, 24);

    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      backend: this.s(raw.backend) === "agent-orchestrator" ? "agent-orchestrator" : "openclaw",
      sessionId: this.s(raw.session_id) || null,
      packAssets,
    };
  }

  private findAgentById(userId: string, projectId: string, agentId: string) {
    const row = this.sqlite.connection
      .prepare("SELECT * FROM agents WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1")
      .get(userId, projectId, agentId) as Record<string, unknown> | undefined;
    return row ? this.toAgentRow(row) : null;
  }

  private workspaceRootPath() {
    if (process.env.OPENCLAW_WORKSPACE_ROOT?.trim()) {
      return path.resolve(process.env.OPENCLAW_WORKSPACE_ROOT.trim());
    }
    return path.resolve(process.cwd(), "..", "..");
  }

  private safeWithinWorkspace(targetPath: string) {
    const workspaceRoot = this.workspaceRootPath();
    const normalized = path.resolve(targetPath);
    const relative = path.relative(workspaceRoot, normalized);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  private resolveWorkspaceRoot() {
    return this.workspaceRootPath();
  }

  private resolveAoCliEntry() {
    const aoRoot = resolveAgentOrchestratorRootFromBackendCwd();
    const candidates = [path.join(aoRoot, AO_CLI_ENTRY)];
    return candidates.find((candidate) => existsSync(candidate)) || candidates[0]!;
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
    if (sessionIds.length > 0) parsed.sessionIds = sessionIds;

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

  private async sendToAo(sessionId: string, message: string): Promise<AgentOrchestratorResult> {
    let cliEntry: string;
    try {
      cliEntry = this.resolveAoCliEntry();
    } catch (error) {
      return {
        ok: false,
        status: 503,
        body: String((error as Error)?.message || "agent-orchestrator source pack inactive"),
        command: "node",
        args: [AO_CLI_ENTRY, "send", sessionId, message],
        sessionId,
        sessionIds: [],
        parsed: null,
      };
    }
    const command = "node";
    const args = [cliEntry, "send", sessionId, message];
    const aoRoot = path.resolve(cliEntry, "..", "..", "..", "..");

    try {
      const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
        cwd: aoRoot,
        windowsHide: true,
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const body = [String(stdout || "").trim(), String(stderr || "").trim()]
        .filter(Boolean)
        .join("\n\n");
      const sessionIds = this.extractAoSessionIds(body);
      return {
        ok: true,
        status: 200,
        body,
        command,
        args,
        sessionId: sessionIds[0] || sessionId,
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
      return {
        ok: false,
        status: typeof execError.code === "number" ? execError.code : 502,
        body,
        command,
        args,
        sessionId: sessionIds[0] || sessionId,
        sessionIds,
        parsed: this.parseAoBody(body),
      };
    }
  }

  async getPackAssets(input: { projectId?: unknown; agentId?: unknown }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const agentId = this.s(input.agentId);
    if (!agentId) {
      throw new AgentsExtrasError({
        message: "Agent ID is required.",
        reason: "missing_agent_id",
        status: 400,
      });
    }

    const agent = this.findAgentById(user.id, projectId, agentId);
    if (!agent) {
      throw new AgentsExtrasError({
        message: "Agent not found.",
        reason: "agent_not_found",
        status: 404,
      });
    }

    const previews = await Promise.all(
      agent.packAssets.slice(0, 8).map(async (asset) => {
        if (!this.safeWithinWorkspace(asset.path)) {
          return { ...asset, preview: "Path is outside workspace and cannot be previewed." };
        }

        try {
          if (asset.kind === "directory") {
            const entries = await readdir(asset.path);
            return {
              ...asset,
              preview: entries.slice(0, 20).join("\n") || "(empty directory)",
            };
          }

          const content = await readFile(asset.path, "utf8");
          return {
            ...asset,
            preview: content.slice(0, 4000),
          };
        } catch (error) {
          return {
            ...asset,
            preview: `Unable to load preview: ${error instanceof Error ? error.message : "Unknown error"}`,
          };
        }
      }),
    );

    return { assets: previews };
  }

  async send(input: { projectId?: unknown; agentId?: unknown; message?: unknown }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const agentId = this.s(input.agentId);
    const message = this.s(input.message);

    if (!agentId) {
      throw new AgentsExtrasError({
        message: "Agent ID is required.",
        reason: "missing_agent_id",
        status: 400,
      });
    }

    const agent = this.findAgentById(user.id, projectId, agentId);
    if (!agent) {
      throw new AgentsExtrasError({
        message: "Agent not found.",
        reason: "agent_not_found",
        status: 404,
      });
    }
    if (agent.backend !== "agent-orchestrator") {
      throw new AgentsExtrasError({
        message: "Send is only supported for agent-orchestrator agents.",
        reason: "unsupported_backend",
        status: 400,
      });
    }
    const catalogEntry = getForgeSourcePackCatalogEntryFromBackendCwd(["agent-orchestrator"]);
    if (catalogEntry?.classification !== "live_runtime") {
      throw new AgentsExtrasError({
        message: "agent-orchestrator remains follow-up only; interactive host send is blocked.",
        reason: "backend_follow_up_only",
        status: 409,
        details: { catalogEntry },
      });
    }
    if (!agent.sessionId) {
      throw new AgentsExtrasError({
        message: "This agent does not have an active session.",
        reason: "session_missing",
        status: 400,
      });
    }
    if (!message) {
      throw new AgentsExtrasError({
        message: "Message is required.",
        reason: "missing_message",
        status: 400,
      });
    }

    const result = await this.sendToAo(agent.sessionId, message);
    return { agent, result, status: result.ok ? 200 : 502 };
  }
}
