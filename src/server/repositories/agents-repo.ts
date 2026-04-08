import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { normalizeTopics } from "@/lib/topics";
import { db } from "@/server/sqlite/db";
import { stringifyJsonField, parseJsonField } from "@/server/sqlite/json";
import { agents } from "@/server/sqlite/schema";
import type {
  AgentBackend,
  AgentChainPolicy,
  AgentDefinition,
  AgentExecutor,
  AgentRole,
  AgentRunStatus,
  AgentSourcePack,
  AgentStatus,
  AgentWorkflowProfile,
  AgentPackAsset,
} from "@/types/agents";
import { AGENT_PRESETS } from "@/lib/agent-presets";
import { normalizeAgentProfileId } from "@/lib/agents/agent-profiles";

function normalizeRole(value: string | undefined | null): AgentRole {
  if (value === "planner" || value === "builder" || value === "reviewer" || value === "researcher") {
    return value;
  }
  return value === "custom" ? "custom" : "builder";
}

function normalizeExecutor(value: string | undefined | null): AgentExecutor {
  if (value === "codex" || value === "manual") return value;
  return "openclaw";
}

function normalizeBackend(value: string | undefined | null): AgentBackend {
  return value === "agent-orchestrator" ? "agent-orchestrator" : "openclaw";
}

function normalizeStatus(value: string | undefined | null): AgentStatus {
  return value === "paused" ? "paused" : "active";
}

function normalizeChainPolicy(value: string | undefined | null): AgentChainPolicy {
  switch (value) {
    case "auto_on_success":
    case "auto_always":
    case "stop_on_first_failure":
      return value;
    default:
      return "manual";
  }
}

function normalizeSourcePack(value: string | undefined | null): AgentSourcePack {
  if (
    value === "agency-agents" ||
    value === "arscontexta" ||
    value === "superpowers" ||
    value === "software-design-philosophy-skill" ||
    value === "skills-manager" ||
    value === "impeccable" ||
    value === "celtrix"
  ) return value;
  return "native";
}

function defaultWorkflowProfile(): AgentWorkflowProfile {
  return {
    mode: "execution",
    objectives: [],
    constraints: [],
    deliverables: [],
  };
}

function normalizeWorkflowProfile(value: unknown): AgentWorkflowProfile {
  if (!value || typeof value !== "object") return defaultWorkflowProfile();
  const row = value as Partial<AgentWorkflowProfile>;
  const mode = row.mode;
  return {
    mode: mode === "planning" || mode === "review" || mode === "research" ? mode : "execution",
    objectives: normalizeTopics(Array.isArray(row.objectives) ? row.objectives : []),
    constraints: normalizeTopics(Array.isArray(row.constraints) ? row.constraints : []),
    deliverables: normalizeTopics(Array.isArray(row.deliverables) ? row.deliverables : []),
  };
}

function extractProfileIdFromWorkflow(value: unknown) {
  if (!value || typeof value !== "object") return "default" as const;
  return normalizeAgentProfileId((value as { profileId?: unknown }).profileId);
}

function normalizeHandoffAgentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => String(row || "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizePackAssets(value: unknown): AgentPackAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Partial<AgentPackAsset> & { path: string } => Boolean(row && typeof row === "object" && typeof (row as { path?: unknown }).path === "string"))
    .map((row) => ({
      label: String(row.label || row.path).trim().slice(0, 120),
      path: String(row.path).trim(),
      kind: (row.kind === "directory" ? "directory" : "file") as AgentPackAsset["kind"],
    }))
    .filter((row) => row.path.length > 0)
    .slice(0, 24);
}

function normalizeArea(value: string | undefined | null) {
  const trimmed = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return trimmed || null;
}

function toRow(raw: typeof agents.$inferSelect): AgentDefinition {
  const workflowData = parseJsonField(raw.workflowJson);
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    name: raw.name,
    role: normalizeRole(raw.role),
    description: raw.description || null,
    executor: normalizeExecutor(raw.executor),
    backend: normalizeBackend(raw.backend),
    sessionId: raw.sessionId || null,
    status: normalizeStatus(raw.status),
    area: raw.area || null,
    topics: normalizeTopics(parseJsonField(raw.topicsJson)),
    systemPrompt: raw.systemPrompt,
    model: raw.model || null,
    profileId: extractProfileIdFromWorkflow(workflowData),
    sourcePack: normalizeSourcePack(raw.sourcePack),
    sourceRef: raw.sourceRef || null,
    workflowProfile: normalizeWorkflowProfile(workflowData),
    packAssets: normalizePackAssets(parseJsonField(raw.packAssetsJson)),
    handoffAgentIds: normalizeHandoffAgentIds(parseJsonField(raw.handoffAgentIdsJson)),
    chainPolicy: normalizeChainPolicy(raw.chainPolicy),
    lastRunAt: raw.lastRunAt || null,
    lastRunStatus: (raw.lastRunStatus as AgentRunStatus | null) || null,
    lastRunSummary: raw.lastRunSummary || null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function listAgents(userId: string, projectId: string) {
  return db
    .select()
    .from(agents)
    .where(and(eq(agents.userId, userId), eq(agents.projectId, projectId)))
    .orderBy(desc(agents.updatedAt))
    .all()
    .map(toRow);
}

export function ensureProjectAgents(userId: string, projectId: string) {
  const existing = listAgents(userId, projectId);
  if (existing.length > 0) return existing;

  for (const preset of AGENT_PRESETS) {
    createAgent(userId, projectId, {
      name: preset.name,
      role: preset.role,
      description: preset.description,
      executor: preset.executor,
      status: "active",
      area: preset.area,
      topics: preset.topics,
      systemPrompt: preset.systemPrompt,
      sourcePack: "native",
      sourceRef: `preset:${preset.name.toLowerCase()}`,
    });
  }

  return listAgents(userId, projectId);
}

export function findAgentById(userId: string, projectId: string, id: string) {
  const row = db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, userId), eq(agents.projectId, projectId)))
    .get();
  return row ? toRow(row) : undefined;
}

export function createAgent(
  userId: string,
  projectId: string,
  data: {
    name: string;
    role?: string;
    description?: string | null;
    executor?: string;
    backend?: string;
    sessionId?: string | null;
    status?: string;
    area?: string | null;
    topics?: string[];
    systemPrompt?: string;
    model?: string | null;
    profileId?: string;
    sourcePack?: string;
    sourceRef?: string | null;
    workflowProfile?: unknown;
    packAssets?: unknown;
    handoffAgentIds?: unknown;
    chainPolicy?: string;
  },
) {
  const now = new Date().toISOString();
  const profileId = normalizeAgentProfileId(data.profileId);
  const workflowProfile = normalizeWorkflowProfile(data.workflowProfile);
  const row = {
    id: randomUUID(),
    userId,
    projectId,
    name: data.name.trim().slice(0, 80),
    role: normalizeRole(data.role),
    description: String(data.description || "").trim() || null,
    executor: normalizeExecutor(data.executor),
    backend: normalizeBackend(data.backend),
    sessionId: String(data.sessionId || "").trim() || null,
    status: normalizeStatus(data.status),
    area: normalizeArea(data.area),
    topicsJson: stringifyJsonField(normalizeTopics(data.topics || [])),
    systemPrompt: String(data.systemPrompt || "").trim().slice(0, 8000),
    model: String(data.model || "").trim() || null,
    sourcePack: normalizeSourcePack(data.sourcePack),
    sourceRef: String(data.sourceRef || "").trim() || null,
    workflowJson: stringifyJsonField({ ...workflowProfile, profileId }),
    packAssetsJson: stringifyJsonField(normalizePackAssets(data.packAssets)),
    handoffAgentIdsJson: stringifyJsonField(normalizeHandoffAgentIds(data.handoffAgentIds)),
    chainPolicy: normalizeChainPolicy(data.chainPolicy),
    lastRunAt: null,
    lastRunStatus: null,
    lastRunSummary: null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(agents).values(row).run();
  return toRow(row);
}

export function updateAgent(
  userId: string,
  projectId: string,
  id: string,
  data: {
    name?: string;
    role?: string;
    description?: string | null;
    executor?: string;
    backend?: string;
    sessionId?: string | null;
    status?: string;
    area?: string | null;
    topics?: string[];
    systemPrompt?: string;
    model?: string | null;
    profileId?: string;
    sourcePack?: string;
    sourceRef?: string | null;
    workflowProfile?: unknown;
    packAssets?: unknown;
    handoffAgentIds?: unknown;
    chainPolicy?: string;
  },
) {
  const existing = findAgentById(userId, projectId, id);
  if (!existing) return null;

  const updated: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (data.name !== undefined) updated.name = data.name.trim().slice(0, 80);
  if (data.role !== undefined) updated.role = normalizeRole(data.role);
  if (data.description !== undefined) updated.description = String(data.description || "").trim() || null;
  if (data.executor !== undefined) updated.executor = normalizeExecutor(data.executor);
  if (data.backend !== undefined) updated.backend = normalizeBackend(data.backend);
  if (data.sessionId !== undefined) updated.sessionId = String(data.sessionId || "").trim() || null;
  if (data.status !== undefined) updated.status = normalizeStatus(data.status);
  if (data.area !== undefined) updated.area = normalizeArea(data.area);
  if (data.topics !== undefined) updated.topicsJson = stringifyJsonField(normalizeTopics(data.topics));
  if (data.systemPrompt !== undefined) updated.systemPrompt = String(data.systemPrompt || "").trim().slice(0, 8000);
  if (data.model !== undefined) updated.model = String(data.model || "").trim() || null;
  if (data.sourcePack !== undefined) updated.sourcePack = normalizeSourcePack(data.sourcePack);
  if (data.sourceRef !== undefined) updated.sourceRef = String(data.sourceRef || "").trim() || null;
  if (data.workflowProfile !== undefined || data.profileId !== undefined) {
    const workflowProfile = normalizeWorkflowProfile(data.workflowProfile ?? existing.workflowProfile);
    const profileId = data.profileId !== undefined ? normalizeAgentProfileId(data.profileId) : existing.profileId;
    updated.workflowJson = stringifyJsonField({ ...workflowProfile, profileId });
  }
  if (data.packAssets !== undefined) updated.packAssetsJson = stringifyJsonField(normalizePackAssets(data.packAssets));
  if (data.handoffAgentIds !== undefined) updated.handoffAgentIdsJson = stringifyJsonField(normalizeHandoffAgentIds(data.handoffAgentIds));
  if (data.chainPolicy !== undefined) updated.chainPolicy = normalizeChainPolicy(data.chainPolicy);

  db.update(agents)
    .set(updated)
    .where(and(eq(agents.id, id), eq(agents.userId, userId), eq(agents.projectId, projectId)))
    .run();

  return findAgentById(userId, projectId, id);
}

export function recordAgentRun(
  userId: string,
  projectId: string,
  id: string,
  status: AgentRunStatus,
  summary: string,
) {
  const now = new Date().toISOString();

  db.update(agents)
    .set({
      lastRunAt: now,
      lastRunStatus: status,
      lastRunSummary: summary.trim().slice(0, 240),
      updatedAt: now,
    })
    .where(and(eq(agents.id, id), eq(agents.userId, userId), eq(agents.projectId, projectId)))
    .run();

  return findAgentById(userId, projectId, id);
}

export function deleteAgent(userId: string, projectId: string, id: string) {
  const result = db
    .delete(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, userId), eq(agents.projectId, projectId)))
    .run();
  return result.changes > 0;
}
