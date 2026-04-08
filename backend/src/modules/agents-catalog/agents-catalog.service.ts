import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SqliteService } from "../../infra/sqlite/sqlite.service";
import { getForgeSourcePackCatalogEntryFromBackendCwd } from "../../infra/paths/directive-source-packs";

const DEFAULT_PROJECT_ID = "mission-control";

type AgentRole = "planner" | "builder" | "reviewer" | "researcher" | "custom";
type AgentExecutor = "openclaw" | "codex" | "manual";
type AgentBackend = "openclaw" | "agent-orchestrator";
type AgentStatus = "active" | "paused";
type AgentSourcePack =
  | "native"
  | "agency-agents"
  | "arscontexta"
  | "superpowers"
  | "software-design-philosophy-skill"
  | "skills-manager"
  | "impeccable"
  | "celtrix";
type AgentChainPolicy = "manual" | "auto_on_success" | "auto_always" | "stop_on_first_failure";
type AgentProfileId = "default" | "impeccable-ui";

interface AgentWorkflowProfile {
  mode: "execution" | "planning" | "review" | "research";
  objectives: string[];
  constraints: string[];
  deliverables: string[];
}

interface AgentPackAsset {
  label: string;
  path: string;
  kind: "file" | "directory";
}

interface AgentRow {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  role: AgentRole;
  description: string | null;
  executor: AgentExecutor;
  backend: AgentBackend;
  sessionId: string | null;
  status: AgentStatus;
  area: string | null;
  topics: string[];
  systemPrompt: string;
  model: string | null;
  profileId: AgentProfileId;
  sourcePack: AgentSourcePack;
  sourceRef: string | null;
  workflowProfile: AgentWorkflowProfile;
  packAssets: AgentPackAsset[];
  handoffAgentIds: string[];
  chainPolicy: AgentChainPolicy;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export class AgentsCatalogError extends Error {
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
export class AgentsCatalogService {
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

  private stringifyJson(value: unknown) {
    return JSON.stringify(value);
  }

  private resolveProjectId(projectId?: unknown) {
    return this.s(projectId) || DEFAULT_PROJECT_ID;
  }

  private normalizeTopics(value: unknown) {
    if (!Array.isArray(value)) return [] as string[];
    const seen = new Set<string>();
    const output: string[] = [];
    for (const row of value) {
      const normalized = this.s(row).toLowerCase().replace(/\s+/g, "-");
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      output.push(normalized);
    }
    return output.slice(0, 24);
  }

  private normalizeRole(value: unknown): AgentRole {
    const normalized = this.s(value);
    if (
      normalized === "planner" ||
      normalized === "builder" ||
      normalized === "reviewer" ||
      normalized === "researcher" ||
      normalized === "custom"
    ) {
      return normalized;
    }
    return "builder";
  }

  private normalizeExecutor(value: unknown): AgentExecutor {
    const normalized = this.s(value);
    if (normalized === "codex" || normalized === "manual") return normalized;
    return "openclaw";
  }

  private normalizeBackend(value: unknown): AgentBackend {
    return this.s(value) === "agent-orchestrator" ? "agent-orchestrator" : "openclaw";
  }

  private normalizeStatus(value: unknown): AgentStatus {
    return this.s(value) === "paused" ? "paused" : "active";
  }

  private normalizeChainPolicy(value: unknown): AgentChainPolicy {
    const normalized = this.s(value);
    if (
      normalized === "auto_on_success" ||
      normalized === "auto_always" ||
      normalized === "stop_on_first_failure"
    ) {
      return normalized;
    }
    return "manual";
  }

  private normalizeSourcePack(value: unknown): AgentSourcePack {
    const normalized = this.s(value);
    if (
      normalized === "agency-agents" ||
      normalized === "arscontexta" ||
      normalized === "superpowers" ||
      normalized === "software-design-philosophy-skill" ||
      normalized === "skills-manager" ||
      normalized === "impeccable" ||
      normalized === "celtrix"
    ) {
      return normalized;
    }
    return "native";
  }

  private normalizeProfileId(value: unknown): AgentProfileId {
    return this.s(value) === "impeccable-ui" ? "impeccable-ui" : "default";
  }

  private assertBackendAllowed(backend: AgentBackend) {
    if (backend !== "agent-orchestrator") return;
    const entry = getForgeSourcePackCatalogEntryFromBackendCwd(["agent-orchestrator"]);
    if (entry?.classification === "live_runtime") return;
    throw new AgentsCatalogError({
      message: "agent-orchestrator remains follow-up only and cannot be selected as a live agent backend.",
      reason: "backend_follow_up_only",
      status: 409,
      details: {
        backend,
        catalogEntry: entry,
      },
    });
  }

  private normalizeArea(value: unknown) {
    const normalized = this.s(value).toLowerCase().replace(/\s+/g, " ");
    return normalized || null;
  }

  private normalizeHandoffAgentIds(value: unknown) {
    if (!Array.isArray(value)) return [] as string[];
    return value
      .map((row) => this.s(row))
      .filter(Boolean)
      .slice(0, 8);
  }

  private normalizePackAssets(value: unknown) {
    if (!Array.isArray(value)) return [] as AgentPackAsset[];
    return value
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
  }

  private defaultWorkflowProfile(): AgentWorkflowProfile {
    return {
      mode: "execution",
      objectives: [],
      constraints: [],
      deliverables: [],
    };
  }

  private normalizeWorkflowProfile(value: unknown): AgentWorkflowProfile {
    if (!value || typeof value !== "object") return this.defaultWorkflowProfile();
    const row = value as {
      mode?: unknown;
      objectives?: unknown;
      constraints?: unknown;
      deliverables?: unknown;
    };
    const modeRaw = this.s(row.mode);
    const mode: AgentWorkflowProfile["mode"] =
      modeRaw === "planning" || modeRaw === "review" || modeRaw === "research" ? modeRaw : "execution";
    return {
      mode,
      objectives: this.normalizeTopics(row.objectives),
      constraints: this.normalizeTopics(row.constraints),
      deliverables: this.normalizeTopics(row.deliverables),
    };
  }

  private extractProfileIdFromWorkflow(value: unknown): AgentProfileId {
    if (!value || typeof value !== "object") return "default";
    return this.normalizeProfileId((value as { profileId?: unknown }).profileId);
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
    const workflowData = this.parseJsonObject(raw.workflow_json);
    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      name: this.s(raw.name),
      role: this.normalizeRole(raw.role),
      description: this.s(raw.description) || null,
      executor: this.normalizeExecutor(raw.executor),
      backend: this.normalizeBackend(raw.backend),
      sessionId: this.s(raw.session_id) || null,
      status: this.normalizeStatus(raw.status),
      area: this.s(raw.area) || null,
      topics: this.normalizeTopics(this.parseJsonArray(raw.topics_json)),
      systemPrompt: this.s(raw.system_prompt),
      model: this.s(raw.model) || null,
      profileId: this.extractProfileIdFromWorkflow(workflowData),
      sourcePack: this.normalizeSourcePack(raw.source_pack),
      sourceRef: this.s(raw.source_ref) || null,
      workflowProfile: this.normalizeWorkflowProfile(workflowData),
      packAssets: this.normalizePackAssets(this.parseJsonArray(raw.pack_assets_json)),
      handoffAgentIds: this.normalizeHandoffAgentIds(this.parseJsonArray(raw.handoff_agent_ids_json)),
      chainPolicy: this.normalizeChainPolicy(raw.chain_policy),
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

  async list(input: { projectId?: unknown }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const rows = this.sqlite.connection
      .prepare("SELECT * FROM agents WHERE user_id = ? AND project_id = ? ORDER BY updated_at DESC")
      .all(user.id, projectId) as Array<Record<string, unknown>>;
    return {
      agents: rows.map((row) => this.toAgentRow(row)),
    };
  }

  async create(input: { projectId?: unknown; body: Record<string, unknown> }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const name = this.s(input.body.name);
    if (!name) {
      throw new AgentsCatalogError({
        message: "Agent name is required.",
        reason: "missing_name",
        status: 400,
      });
    }

    const now = new Date().toISOString();
    const profileId = this.normalizeProfileId(input.body.profileId);
    const workflowProfile = this.normalizeWorkflowProfile(input.body.workflowProfile);
    const row = {
      id: randomUUID(),
      user_id: user.id,
      project_id: projectId,
      name: name.slice(0, 80),
      role: this.normalizeRole(input.body.role),
      description: this.s(input.body.description) || null,
      executor: this.normalizeExecutor(input.body.executor),
      backend: this.normalizeBackend(input.body.backend),
      session_id: this.s(input.body.sessionId) || null,
      status: this.normalizeStatus(input.body.status),
      area: this.normalizeArea(input.body.area),
      topics_json: this.stringifyJson(this.normalizeTopics(input.body.topics)),
      system_prompt: this.s(input.body.systemPrompt).slice(0, 8000),
      model: this.s(input.body.model) || null,
      source_pack: this.normalizeSourcePack(input.body.sourcePack),
      source_ref: this.s(input.body.sourceRef) || null,
      workflow_json: this.stringifyJson({ ...workflowProfile, profileId }),
      pack_assets_json: this.stringifyJson(this.normalizePackAssets(input.body.packAssets)),
      handoff_agent_ids_json: this.stringifyJson(this.normalizeHandoffAgentIds(input.body.handoffAgentIds)),
      chain_policy: this.normalizeChainPolicy(input.body.chainPolicy),
      last_run_at: null,
      last_run_status: null,
      last_run_summary: null,
      created_at: now,
      updated_at: now,
    };

    this.assertBackendAllowed(row.backend);

    this.sqlite.connection
      .prepare(
        "INSERT INTO agents (id, user_id, project_id, name, role, description, executor, backend, session_id, status, area, topics_json, system_prompt, model, source_pack, source_ref, workflow_json, pack_assets_json, handoff_agent_ids_json, chain_policy, last_run_at, last_run_status, last_run_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.user_id,
        row.project_id,
        row.name,
        row.role,
        row.description,
        row.executor,
        row.backend,
        row.session_id,
        row.status,
        row.area,
        row.topics_json,
        row.system_prompt,
        row.model,
        row.source_pack,
        row.source_ref,
        row.workflow_json,
        row.pack_assets_json,
        row.handoff_agent_ids_json,
        row.chain_policy,
        row.last_run_at,
        row.last_run_status,
        row.last_run_summary,
        row.created_at,
        row.updated_at,
      );

    return {
      msg: "Agent created.",
      agent: this.findAgentById(user.id, projectId, row.id),
    };
  }

  async update(input: { projectId?: unknown; agentId?: unknown; body: Record<string, unknown> }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const agentId = this.s(input.agentId);
    if (!agentId) {
      throw new AgentsCatalogError({
        message: "Agent ID is required.",
        reason: "missing_agent_id",
        status: 400,
      });
    }

    const existing = this.findAgentById(user.id, projectId, agentId);
    if (!existing) {
      throw new AgentsCatalogError({
        message: "Agent not found.",
        reason: "agent_not_found",
        status: 404,
      });
    }

    const fields: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];
    const body = input.body;

    if (body.name !== undefined) {
      fields.push("name = ?");
      params.push(this.s(body.name).slice(0, 80));
    }
    if (body.role !== undefined) {
      fields.push("role = ?");
      params.push(this.normalizeRole(body.role));
    }
    if (body.description !== undefined) {
      fields.push("description = ?");
      params.push(this.s(body.description) || null);
    }
    if (body.executor !== undefined) {
      fields.push("executor = ?");
      params.push(this.normalizeExecutor(body.executor));
    }
    if (body.backend !== undefined) {
      const normalizedBackend = this.normalizeBackend(body.backend);
      this.assertBackendAllowed(normalizedBackend);
      fields.push("backend = ?");
      params.push(normalizedBackend);
    }
    if (body.sessionId !== undefined) {
      fields.push("session_id = ?");
      params.push(this.s(body.sessionId) || null);
    }
    if (body.status !== undefined) {
      fields.push("status = ?");
      params.push(this.normalizeStatus(body.status));
    }
    if (body.area !== undefined) {
      fields.push("area = ?");
      params.push(this.normalizeArea(body.area));
    }
    if (body.topics !== undefined) {
      fields.push("topics_json = ?");
      params.push(this.stringifyJson(this.normalizeTopics(body.topics)));
    }
    if (body.systemPrompt !== undefined) {
      fields.push("system_prompt = ?");
      params.push(this.s(body.systemPrompt).slice(0, 8000));
    }
    if (body.model !== undefined) {
      fields.push("model = ?");
      params.push(this.s(body.model) || null);
    }
    if (body.sourcePack !== undefined) {
      fields.push("source_pack = ?");
      params.push(this.normalizeSourcePack(body.sourcePack));
    }
    if (body.sourceRef !== undefined) {
      fields.push("source_ref = ?");
      params.push(this.s(body.sourceRef) || null);
    }
    if (body.workflowProfile !== undefined || body.profileId !== undefined) {
      const profileId = body.profileId !== undefined
        ? this.normalizeProfileId(body.profileId)
        : existing.profileId;
      const workflowProfile = body.workflowProfile !== undefined
        ? this.normalizeWorkflowProfile(body.workflowProfile)
        : existing.workflowProfile;
      fields.push("workflow_json = ?");
      params.push(this.stringifyJson({ ...workflowProfile, profileId }));
    }
    if (body.packAssets !== undefined) {
      fields.push("pack_assets_json = ?");
      params.push(this.stringifyJson(this.normalizePackAssets(body.packAssets)));
    }
    if (body.handoffAgentIds !== undefined) {
      fields.push("handoff_agent_ids_json = ?");
      params.push(this.stringifyJson(this.normalizeHandoffAgentIds(body.handoffAgentIds)));
    }
    if (body.chainPolicy !== undefined) {
      fields.push("chain_policy = ?");
      params.push(this.normalizeChainPolicy(body.chainPolicy));
    }

    params.push(user.id, projectId, agentId);

    this.sqlite.connection
      .prepare(`UPDATE agents SET ${fields.join(", ")} WHERE user_id = ? AND project_id = ? AND id = ?`)
      .run(...params);

    return {
      msg: "Agent updated.",
      agent: this.findAgentById(user.id, projectId, agentId),
    };
  }

  async remove(input: { projectId?: unknown; agentId?: unknown }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const agentId = this.s(input.agentId);
    if (!agentId) {
      throw new AgentsCatalogError({
        message: "Agent ID is required.",
        reason: "missing_agent_id",
        status: 400,
      });
    }

    const result = this.sqlite.connection
      .prepare("DELETE FROM agents WHERE user_id = ? AND project_id = ? AND id = ?")
      .run(user.id, projectId, agentId);
    if (!result.changes) {
      throw new AgentsCatalogError({
        message: "Agent not found.",
        reason: "agent_not_found",
        status: 404,
      });
    }

    return {
      msg: "Agent deleted.",
    };
  }
}
