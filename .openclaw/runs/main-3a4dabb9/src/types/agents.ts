import type { AgentProfileId } from "@/lib/agents/agent-profiles";

export type AgentRole = "planner" | "builder" | "reviewer" | "researcher" | "custom";
export type AgentExecutor = "openclaw" | "codex" | "manual";
export type AgentBackend = "openclaw" | "agent-orchestrator";
export type AgentStatus = "active" | "paused";
export type AgentRunStatus = "queued" | "dispatched" | "running" | "success" | "warning" | "error";
export type AgentSourcePack = "native" | "agency-agents" | "arscontexta";
export type AgentChainPolicy = "manual" | "auto_on_success" | "auto_always" | "stop_on_first_failure";

export interface AgentWorkflowProfile {
  mode: "execution" | "planning" | "review" | "research";
  objectives: string[];
  constraints: string[];
  deliverables: string[];
}

export interface AgentPackAsset {
  label: string;
  path: string;
  kind: "file" | "directory";
}

export interface AgentDefinition {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  role: AgentRole;
  description: string | null;
  executor: AgentExecutor;
  status: AgentStatus;
  area: string | null;
  topics: string[];
  systemPrompt: string;
  model: string | null;
  profileId: AgentProfileId;
  backend: AgentBackend;
  sessionId: string | null;
  sourcePack: AgentSourcePack;
  sourceRef: string | null;
  workflowProfile: AgentWorkflowProfile;
  packAssets: AgentPackAsset[];
  handoffAgentIds: string[];
  chainPolicy: AgentChainPolicy;
  lastRunAt: string | null;
  lastRunStatus: AgentRunStatus | null;
  lastRunSummary: string | null;
  createdAt: string;
  updatedAt: string;
}
