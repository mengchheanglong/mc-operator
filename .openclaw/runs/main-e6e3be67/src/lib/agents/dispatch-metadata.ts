import type { AgentBackend } from "@/types/agents";

export interface DispatchHandoffMetadata {
  agentId: string;
  name: string;
  ok: boolean;
  summary: string;
  sessionId: string | null;
}

export interface AgentDispatchMetadata extends Record<string, unknown> {
  agentId: string;
  openclawAgentId: string | null;
  backend: AgentBackend;
  sessionId: string | null;
  command: string;
  args: string[];
  parsed: Record<string, unknown> | null;
  handoffs: DispatchHandoffMetadata[];
  failureClass: string | null;
  attempts: number;
  totalDurationMs: number;
  modelUsed: string | null;
  fallbackUsed: boolean;
}

export function normalizeDispatchHandoffs(value: unknown): DispatchHandoffMetadata[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Partial<DispatchHandoffMetadata>;
      const agentId = String(row.agentId || "").trim();
      const name = String(row.name || "").trim();
      if (!agentId || !name) return null;

      return {
        agentId,
        name,
        ok: row.ok !== false,
        summary: String(row.summary || "").trim() || "No summary.",
        sessionId: String(row.sessionId || "").trim() || null,
      };
    })
    .filter((row): row is DispatchHandoffMetadata => Boolean(row));
}

export function buildAgentDispatchMetadata(input: {
  agentId: string;
  openclawAgentId?: string | null;
  backend: AgentBackend;
  sessionId?: string | null;
  command: string;
  args: string[];
  parsed?: Record<string, unknown> | null;
  handoffs?: unknown;
  failureClass?: string | null;
  attempts?: number;
  totalDurationMs?: number;
  modelUsed?: string | null;
  fallbackUsed?: boolean;
}): AgentDispatchMetadata {
  return {
    agentId: String(input.agentId || "").trim(),
    openclawAgentId: String(input.openclawAgentId || "").trim() || null,
    backend: input.backend,
    sessionId: String(input.sessionId || "").trim() || null,
    command: String(input.command || "").trim(),
    args: Array.isArray(input.args) ? input.args.map((value) => String(value || "")).filter(Boolean) : [],
    parsed: input.parsed && typeof input.parsed === "object" ? input.parsed : null,
    handoffs: normalizeDispatchHandoffs(input.handoffs),
    failureClass: String(input.failureClass || "").trim() || null,
    attempts: Number.isFinite(input.attempts) ? Number(input.attempts) : 1,
    totalDurationMs: Number.isFinite(input.totalDurationMs) ? Number(input.totalDurationMs) : 0,
    modelUsed: String(input.modelUsed || "").trim() || null,
    fallbackUsed: Boolean(input.fallbackUsed),
  };
}

export function readAgentDispatchMetadata(value: unknown): AgentDispatchMetadata | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<AgentDispatchMetadata>;
  const agentId = String(data.agentId || "").trim();
  if (!agentId) return null;

  const backend = data.backend === "agent-orchestrator" ? "agent-orchestrator" : "openclaw";

  return {
    agentId,
    openclawAgentId: String(data.openclawAgentId || "").trim() || null,
    backend,
    sessionId: String(data.sessionId || "").trim() || null,
    command: String(data.command || "").trim(),
    args: Array.isArray(data.args) ? data.args.map((value) => String(value || "")).filter(Boolean) : [],
    parsed: data.parsed && typeof data.parsed === "object" ? (data.parsed as Record<string, unknown>) : null,
    handoffs: normalizeDispatchHandoffs(data.handoffs),
    failureClass: String(data.failureClass || "").trim() || null,
    attempts: Number.isFinite(data.attempts) ? Number(data.attempts) : 1,
    totalDurationMs: Number.isFinite(data.totalDurationMs) ? Number(data.totalDurationMs) : 0,
    modelUsed: String(data.modelUsed || "").trim() || null,
    fallbackUsed: Boolean(data.fallbackUsed),
  };
}
