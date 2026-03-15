"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { normalizeTopics } from "@/lib/topics";
import { normalizeDispatchHandoffs, readAgentDispatchMetadata, type DispatchHandoffMetadata } from "@/lib/agents/dispatch-metadata";
import type { AgentBackend, AgentChainPolicy, AgentDefinition, AgentExecutor, AgentRole, AgentStatus } from "@/types/agents";

type BusyMode = "save" | "dispatch" | null;
type LibraryFilter = "all" | "active" | "openclaw";
type ContextTab = "overview" | "workflow" | "playbook" | "references";

interface ToolingCatalogEntry {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  status: "ok" | "missing";
  note: string;
}

interface ToolingCatalogSnapshot {
  toolingRoot: string;
  discoveredRoots: string[];
  entries: ToolingCatalogEntry[];
}

interface EvalGuardSnapshot {
  status: "healthy" | "degraded" | "blocked" | "unavailable";
  promotionStatus: "ready" | "blocked_eval" | "blocked_regression";
  metrics: {
    score: number;
    failureRate: number;
    costUsd: number;
    total: number;
  };
  reasons: string[];
  timestamp: string | null;
}

interface AgentsPageClientProps {
  initialProject: {
    id: string;
    name: string;
    relativePath: string;
  };
  initialAgents: AgentDefinition[];
  toolingCatalog: ToolingCatalogSnapshot;
  evalGuard: EvalGuardSnapshot;
}

interface AgentDraft {
  name: string;
  role: AgentRole;
  description: string;
  executor: AgentExecutor;
  backend: AgentBackend;
  status: AgentStatus;
  area: string;
  topicsInput: string;
  handoffAgentIds: string[];
  chainPolicy: AgentChainPolicy;
  systemPrompt: string;
  model: string;
}

interface DispatchResult {
  agentId: string;
  summary: string;
  brief: string;
  reportHref: string;
  reportId: string;
  handoffs?: DispatchHandoff[];
}

interface AgentBackendStatus {
  ok: boolean;
  status: number;
  body: string;
  sessionId: string | null;
}

interface AgentSessionList {
  ok: boolean;
  status: number;
  body: string;
}

type DispatchHandoff = DispatchHandoffMetadata;

interface LatestRunTimeline {
  source: "dispatch" | "report" | "agent";
  summary: string;
  backend: AgentBackend;
  sessionId: string | null;
  runStatus: AgentDefinition["lastRunStatus"];
  chainPolicy: AgentChainPolicy;
  handoffs: DispatchHandoff[];
  reportHref: string | null;
  brief: string;
}

interface ReportListItem {
  id: string;
  category?: string;
  date: string;
  metadata?: Record<string, unknown>;
}

interface AgentPackAssetPreview {
  label: string;
  path: string;
  kind: "file" | "directory";
  preview: string;
}

interface WorkflowGuardBadgeState {
  scopeId: string;
  reanalysisRequired: boolean;
  lastCostRiskLabel: string;
}

function classifyAsset(asset: AgentPackAssetPreview) {
  const value = `${asset.label} ${asset.path}`.toLowerCase();
  if (value.includes("playbook") || value.includes("workflow") || value.includes("prompt") || value.includes("agent")) return "playbook" as const;
  if (value.includes("reference") || value.includes("readme") || value.includes("methodology") || value.includes("skill")) return "references" as const;
  return "references" as const;
}
function draftFromAgent(agent: AgentDefinition): AgentDraft {
  return {
    name: agent.name,
    role: agent.role,
    description: agent.description || "",
    executor: agent.executor,
    backend: agent.backend,
    status: agent.status,
    area: agent.area || "",
    topicsInput: agent.topics.join(", "),
    handoffAgentIds: agent.handoffAgentIds,
    chainPolicy: agent.chainPolicy,
    systemPrompt: agent.systemPrompt,
    model: agent.model || "",
  };
}

function buildReportHref(date: string) {
  const day = String(date || "").slice(0, 10);
  return day ? `/dashboard/report?day=${encodeURIComponent(day)}` : "/dashboard/report";
}

function buildPayload(draft: AgentDraft) {
  const name = draft.name.trim();
  if (!name) return null;

  return {
    name,
    role: draft.role,
    description: draft.description.trim() || null,
    executor: draft.executor,
    backend: draft.backend,
    status: draft.status,
    area: draft.area.trim() || null,
    topics: normalizeTopics(draft.topicsInput),
    handoffAgentIds: draft.handoffAgentIds,
    chainPolicy: draft.chainPolicy,
    systemPrompt: draft.systemPrompt.trim(),
    model: draft.model.trim() || null,
  };
}

function relativeTime(value: string | null) {
  if (!value) return "Never";
  const deltaSeconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (deltaSeconds < 60) return "just now";
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusTone(status: AgentStatus) {
  return status === "paused"
    ? "border-status-warning/25 bg-status-warning/10 text-status-warning"
    : "border-status-success/25 bg-status-success/10 text-status-success";
}

function runTone(status: AgentDefinition["lastRunStatus"]) {
  switch (status) {
    case "success":
      return "border-status-success/25 bg-status-success/10 text-status-success";
    case "warning":
      return "border-status-warning/25 bg-status-warning/10 text-status-warning";
    case "error":
      return "border-status-error/25 bg-status-error/10 text-status-error";
    case "dispatched":
      return "border-status-info/25 bg-status-info/10 text-status-info";
    default:
      return "border-border bg-bg-panel text-text-muted";
  }
}

function evalGuardTone(status: EvalGuardSnapshot["status"]) {
  switch (status) {
    case "healthy":
      return "border-status-success/25 bg-status-success/10 text-status-success";
    case "degraded":
      return "border-status-warning/25 bg-status-warning/10 text-status-warning";
    case "blocked":
      return "border-status-error/25 bg-status-error/10 text-status-error";
    default:
      return "border-border bg-bg-panel text-text-muted";
  }
}

function roleLabel(role: AgentRole) {
  switch (role) {
    case "planner":
      return "Planner";
    case "builder":
      return "Builder";
    case "reviewer":
      return "Reviewer";
    case "researcher":
      return "Researcher";
    default:
      return "Custom";
  }
}

const TASK_SPARKS = [
  "Audit one high-risk path and propose the safest fix plan.",
  "Implement one scoped improvement and return changed files plus checks.",
  "Review current output quality and list the top 3 concrete fixes.",
  "Create a small, testable task breakdown for today only.",
];

export default function AgentsPageClient({
  initialProject,
  initialAgents,
  toolingCatalog,
  evalGuard,
}: AgentsPageClientProps) {
  const [agents, setAgents] = useState(initialAgents);
  const [selectedId, setSelectedId] = useState(initialAgents[0]?.id || "");
  const [draft, setDraft] = useState<AgentDraft>(
    initialAgents[0]
      ? draftFromAgent(initialAgents[0])
      : {
          name: "",
          role: "builder",
          description: "",
          executor: "openclaw",
          backend: "openclaw",
          status: "active",
          area: "",
          topicsInput: "",
          handoffAgentIds: [],
          chainPolicy: "manual",
          systemPrompt: "",
          model: "",
        },
  );
  const [taskInput, setTaskInput] = useState("");
  const [busyMode, setBusyMode] = useState<BusyMode>(null);
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [assetPreviews, setAssetPreviews] = useState<AgentPackAssetPreview[]>([]);
  const [assetPreviewsLoading, setAssetPreviewsLoading] = useState(false);
  const [contextTab, setContextTab] = useState<ContextTab>("overview");
  const [backendStatus, setBackendStatus] = useState<AgentBackendStatus | null>(null);
  const [backendSessions, setBackendSessions] = useState<AgentSessionList | null>(null);
  const [backendStatusLoading, setBackendStatusLoading] = useState(false);
  const [persistedTimeline, setPersistedTimeline] = useState<LatestRunTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [workflowGuards, setWorkflowGuards] = useState<Record<string, WorkflowGuardBadgeState>>({});

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [agents],
  );

  const selectedAgent = useMemo(
    () => sortedAgents.find((agent) => agent.id === selectedId) ?? null,
    [selectedId, sortedAgents],
  );

  const filteredAgents = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();

    return sortedAgents.filter((agent) => {
      const matchesQuery =
        !query ||
        [
          agent.name,
          agent.role,
          agent.description || "",
          agent.area || "",
          agent.executor,
          ...agent.topics,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      if (!matchesQuery) return false;
      if (libraryFilter === "all") return true;
      if (libraryFilter === "active") return agent.status === "active";
      return agent.executor === "openclaw";
    });
  }, [libraryFilter, libraryQuery, sortedAgents]);

  const visibleDispatch = dispatchResult?.agentId === selectedAgent?.id ? dispatchResult : null;
  const latestRunTimeline = useMemo<LatestRunTimeline | null>(() => {
    if (visibleDispatch && selectedAgent) {
      return {
        source: "dispatch",
        summary: visibleDispatch.summary,
        backend: selectedAgent.backend,
        sessionId: selectedAgent.sessionId,
        runStatus: selectedAgent.lastRunStatus,
        chainPolicy: selectedAgent.chainPolicy,
        handoffs: visibleDispatch.handoffs || [],
        reportHref: visibleDispatch.reportHref || null,
        brief: visibleDispatch.brief,
      };
    }
    return persistedTimeline;
  }, [persistedTimeline, selectedAgent, visibleDispatch]);
  const currentPayload = buildPayload(draft);
  const playbookAssets = assetPreviews.filter((asset) => classifyAsset(asset) === "playbook");
  const referenceAssets = assetPreviews.filter((asset) => classifyAsset(asset) === "references");
  const currentTopics = normalizeTopics(draft.topicsInput);
  const aoAgentCount = useMemo(
    () => agents.filter((agent) => agent.backend === "agent-orchestrator").length,
    [agents],
  );
  const packBackedCount = useMemo(
    () => agents.filter((agent) => agent.sourcePack !== "native" || agent.packAssets.length > 0).length,
    [agents],
  );
  const chainedAgentCount = useMemo(
    () => agents.filter((agent) => agent.handoffAgentIds.length > 0).length,
    [agents],
  );
  const canSave = Boolean(currentPayload && selectedAgent);
  const canDispatch =
    Boolean(currentPayload && selectedAgent) &&
    draft.executor === "openclaw" &&
    draft.status === "active" &&
    Boolean(taskInput.trim());

  useEffect(() => {
    if (!selectedAgent?.id || selectedAgent.packAssets.length === 0) {
      setAssetPreviews([]);
      return;
    }

    let cancelled = false;
    setAssetPreviewsLoading(true);
    axios
      .get(`/api/agents/${selectedAgent.id}/pack-assets`)
      .then((response) => {
        if (!cancelled) {
          setAssetPreviews(Array.isArray(response.data?.assets) ? response.data.assets : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssetPreviews([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAssetPreviewsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAgent?.id, selectedAgent?.packAssets.length]);

  useEffect(() => {
    if (!selectedAgent?.id) {
      setPersistedTimeline(null);
      setTimelineLoading(false);
      return;
    }

    let cancelled = false;
    setTimelineLoading(true);

    axios
      .get("/api/reports", { params: { limit: 80 } })
      .then((response) => {
        if (cancelled) return;
        const rows = Array.isArray(response.data) ? (response.data as ReportListItem[]) : [];
        const report = rows.find((row) => {
          if (!row || typeof row !== "object") return false;
          if (row.category !== "task" && row.category !== "error") return false;
          const metadata = readAgentDispatchMetadata(row.metadata);
          if (!metadata) return false;
          return metadata.agentId === selectedAgent.id;
        });

        if (report) {
          const metadata = readAgentDispatchMetadata(report.metadata);
          if (metadata) {
            setPersistedTimeline({
              source: "report",
              summary: selectedAgent.lastRunSummary || "Latest agent run loaded from report metadata.",
              backend: metadata.backend,
              sessionId: metadata.sessionId || selectedAgent.sessionId || null,
              runStatus: selectedAgent.lastRunStatus,
              chainPolicy: selectedAgent.chainPolicy,
              handoffs: normalizeDispatchHandoffs(metadata.handoffs),
              reportHref: buildReportHref(report.date),
              brief: "",
            });
            return;
          }
        }

        if (selectedAgent.lastRunAt || selectedAgent.lastRunSummary || selectedAgent.lastRunStatus) {
          setPersistedTimeline({
            source: "agent",
            summary: selectedAgent.lastRunSummary || "Latest run metadata is available.",
            backend: selectedAgent.backend,
            sessionId: selectedAgent.sessionId,
            runStatus: selectedAgent.lastRunStatus,
            chainPolicy: selectedAgent.chainPolicy,
            handoffs: [],
            reportHref: null,
            brief: "",
          });
          return;
        }

        setPersistedTimeline(null);
      })
      .catch(() => {
        if (!cancelled) {
          if (selectedAgent.lastRunAt || selectedAgent.lastRunSummary || selectedAgent.lastRunStatus) {
            setPersistedTimeline({
              source: "agent",
              summary: selectedAgent.lastRunSummary || "Latest run metadata is available.",
              backend: selectedAgent.backend,
              sessionId: selectedAgent.sessionId,
              runStatus: selectedAgent.lastRunStatus,
              chainPolicy: selectedAgent.chainPolicy,
              handoffs: [],
              reportHref: null,
              brief: "",
            });
          } else {
            setPersistedTimeline(null);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTimelineLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedAgent?.id,
    selectedAgent?.backend,
    selectedAgent?.chainPolicy,
    selectedAgent?.lastRunAt,
    selectedAgent?.lastRunStatus,
    selectedAgent?.lastRunSummary,
    selectedAgent?.sessionId,
  ]);

  function beginBusy(mode: BusyMode, agentId: string | null = null) {
    setBusyMode(mode);
    setBusyAgentId(agentId);
  }

  function clearBusy() {
    setBusyMode(null);
    setBusyAgentId(null);
  }

  function selectAgent(agent: AgentDefinition) {
    setSelectedId(agent.id);
    setDraft(draftFromAgent(agent));
    setTaskInput("");
    setDispatchResult(null);
    setContextTab("overview");
    setError("");
  }

  function syncAgent(agent: AgentDefinition) {
    setAgents((current) => {
      const index = current.findIndex((item) => item.id === agent.id);
      if (index === -1) return current;
      const next = [...current];
      next[index] = agent;
      return next;
    });
    setSelectedId(agent.id);
    setDraft(draftFromAgent(agent));
  }

  async function persistDraft() {
    if (!selectedAgent) return null;
    const payload = buildPayload(draft);
    if (!payload) {
      setError("Agent name is required.");
      return null;
    }

    const response = await axios.put(`/api/agents/${selectedAgent.id}`, payload);
    const agent = response.data?.agent as AgentDefinition | undefined;
    if (!agent) {
      throw new Error("Agent response missing.");
    }

    syncAgent(agent);
    return agent;
  }

  async function saveAgent() {
    try {
      beginBusy("save", selectedAgent?.id ?? null);
      await persistDraft();
      setError("");
    } catch {
      setError("Unable to save agent.");
    } finally {
      clearBusy();
    }
  }

  async function dispatchAgent() {
    try {
      beginBusy("dispatch", selectedAgent?.id ?? null);
      const agent = await persistDraft();
      if (!agent) return;

      const response = await axios.post(`/api/agents/${agent.id}/dispatch`, {
        task: taskInput.trim(),
      });

      const updated = response.data?.agent as AgentDefinition | undefined;
      if (updated) {
        syncAgent(updated);
      }

      setDispatchResult({
        agentId: agent.id,
        summary: String(response.data?.run?.summary || "Task sent to OpenClaw."),
        brief: String(response.data?.run?.brief || ""),
        reportHref: String(response.data?.run?.reportHref || "/dashboard/report"),
        reportId: String(response.data?.run?.reportId || ""),
        handoffs: normalizeDispatchHandoffs(response.data?.run?.handoffs),
      });
      setError("");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        const updated = error.response.data?.agent as AgentDefinition | undefined;
        if (updated) {
          syncAgent(updated);
        }
        if (error.response.data?.run) {
          setDispatchResult({
            agentId: selectedAgent?.id || "",
            summary: String(error.response.data.run.summary || "Dispatch failed."),
            brief: String(error.response.data.run.brief || ""),
            reportHref: String(error.response.data.run.reportHref || "/dashboard/report"),
            reportId: String(error.response.data.run.reportId || ""),
            handoffs: normalizeDispatchHandoffs(error.response.data.run.handoffs),
          });
        }
        setError(String(error.response.data?.msg || "Unable to dispatch agent."));
      } else {
        setError("Unable to dispatch agent.");
      }
    } finally {
      clearBusy();
    }
  }

  const refreshBackendStatus = useCallback(async function refreshBackendStatus() {
    if (!selectedAgent || selectedAgent.backend !== "agent-orchestrator") return;
    try {
      setBackendStatusLoading(true);
      const response = await axios.get(`/api/agents/${selectedAgent.id}/status`, { params: { includeSessions: 1 } });
      setBackendStatus(response.data?.status as AgentBackendStatus);
      setBackendSessions((response.data?.sessions as AgentSessionList | null) || null);
      setError("");
    } catch {
      setError("Unable to load agent-orchestrator session status.");
    } finally {
      setBackendStatusLoading(false);
    }
  }, [selectedAgent]);

  useEffect(() => {
    if (!selectedAgent?.id || selectedAgent.backend !== "agent-orchestrator" || !selectedAgent.sessionId) {
      setBackendStatus(null);
      setBackendSessions(null);
      return;
    }
    void refreshBackendStatus();
  }, [refreshBackendStatus, selectedAgent?.id, selectedAgent?.backend, selectedAgent?.sessionId]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/workflow/guards", { params: { scope: "agent" } })
      .then((response) => {
        if (cancelled) return;
        const rows = Array.isArray(response.data?.guards) ? response.data.guards : [];
        const next: Record<string, WorkflowGuardBadgeState> = {};
        for (const row of rows) {
          const scopeId = String(row?.scopeId || "").trim();
          if (!scopeId) continue;
          next[scopeId] = {
            scopeId,
            reanalysisRequired: Boolean(row?.reanalysisRequired),
            lastCostRiskLabel: String(row?.lastCostRiskLabel || "cost-risk/low"),
          };
        }
        setWorkflowGuards(next);
      })
      .catch(() => {
        if (!cancelled) setWorkflowGuards({});
      });

    return () => {
      cancelled = true;
    };
  }, [agents.length]);

  async function sendFollowUpToSession() {
    if (!selectedAgent || selectedAgent.backend !== "agent-orchestrator" || !taskInput.trim()) return;
    try {
      beginBusy("dispatch", selectedAgent.id);
      await axios.post(`/api/agents/${selectedAgent.id}/send`, { message: taskInput.trim() });
      await refreshBackendStatus();
      setError("");
    } catch {
      setError("Unable to send follow-up to agent-orchestrator session.");
    } finally {
      clearBusy();
    }
  }

  async function restoreBackendSession() {
    if (!selectedAgent || selectedAgent.backend !== "agent-orchestrator" || !selectedAgent.sessionId) return;
    try {
      beginBusy("dispatch", selectedAgent.id);
      const response = await axios.post(`/api/agents/${selectedAgent.id}/restore`);
      const updated = response.data?.agent as AgentDefinition | undefined;
      if (updated) {
        syncAgent(updated);
      }
      await refreshBackendStatus();
      setError("");
    } catch {
      setError("Unable to restore agent-orchestrator session.");
    } finally {
      clearBusy();
    }
  }

  async function clearBackendSession() {
    if (!selectedAgent || selectedAgent.backend !== "agent-orchestrator") return;
    try {
      beginBusy("dispatch", selectedAgent.id);
      const response = await axios.post(`/api/agents/${selectedAgent.id}/kill`);
      const updated = response.data?.agent as AgentDefinition | undefined;
      if (updated) {
        syncAgent(updated);
      }
      setBackendStatus(null);
      setBackendSessions(null);
      setError("");
    } catch {
      setError("Unable to clear agent session.");
    } finally {
      clearBusy();
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-2rem)] flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6">
      <section className="matte-panel flex-none overflow-hidden">
        <div className="border-b border-border/80 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-bg-card/80 text-text-primary">
                <Bot className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <h1 data-testid="agents-page-title" className="text-lg font-semibold tracking-[-0.04em] text-white">Agents</h1>
                <p className="mt-1 text-sm text-text-secondary">
                  Dispatch-focused operators for {initialProject.name}. Select, tune, and run existing agents.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="matte-chip matte-chip-active">{agents.length} total agents</span>
              <span className="matte-chip">{aoAgentCount} AO-backed</span>
              <span className="matte-chip">{packBackedCount} pack-backed</span>
              <span className="matte-chip">{chainedAgentCount} chained</span>
            </div>
          </div>

          <div className={`mt-3 rounded-2xl border p-3 text-xs ${evalGuardTone(evalGuard.status)}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold uppercase tracking-[0.14em]">Eval guard</div>
              <div className="text-[11px]">{evalGuard.promotionStatus}</div>
            </div>
            <div className="mt-2 text-[11px]">score {evalGuard.metrics.score} · failure {evalGuard.metrics.failureRate} · latest {evalGuard.timestamp ? relativeTime(evalGuard.timestamp) : "unavailable"}</div>
          </div>

          <div className="mt-3 rounded-2xl border border-border bg-bg-card/35 p-3 text-xs text-text-secondary">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold uppercase tracking-[0.14em] text-text-muted">Tooling catalog</div>
              <div className="text-[11px] text-text-muted">{toolingCatalog.discoveredRoots.length} discovered roots</div>
            </div>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              {toolingCatalog.entries.map((entry) => (
                <div key={entry.key} className="rounded-xl border border-border/70 bg-bg-panel/40 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white">{entry.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${entry.status === "ok" ? "border-status-success/25 bg-status-success/10 text-status-success" : "border-status-danger/25 bg-status-danger/10 text-status-danger"}`}>
                      {entry.status}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-text-muted" title={entry.path}>{entry.path}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-text-muted">{entry.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="Search agents..."
                className="input-discord h-13 pr-4"
                style={{ paddingLeft: "3rem" }}
              />
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {([
                ["all", "All"],
                ["active", "Active"],
                ["openclaw", "OpenClaw"],
              ] as Array<[LibraryFilter, string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLibraryFilter(key)}
                  className={`rounded-full border px-2.5 py-1 transition ${
                    libraryFilter === key
                      ? "border-text-muted/30 bg-bg-card text-white"
                      : "border-border bg-bg-panel/50 text-text-muted hover:bg-bg-card"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-[12rem] max-h-[18rem] overflow-y-auto p-3">
          <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map((agent) => {
              const isSelected = selectedId === agent.id;
              const isBusy = busyAgentId === agent.id && busyMode !== null;

              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => selectAgent(agent)}
                  className={`w-full rounded-2xl border px-4 py-3.5 text-left transition ${
                    isSelected
                      ? "border-text-muted/25 bg-bg-card shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                      : "border-border bg-bg-panel/45 hover:border-text-muted/18 hover:bg-bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-white">{agent.name}</div>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusTone(agent.status)}`}
                        >
                          {agent.status}
                        </span>
                        {agent.lastRunStatus ? (
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${runTone(agent.lastRunStatus)}`}
                          >
                            {agent.lastRunStatus}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-text-muted">
                        <span className="matte-chip">{roleLabel(agent.role)}</span>
                        <span className="matte-chip">{agent.backend}</span>
                        {workflowGuards[agent.id]?.lastCostRiskLabel ? <span className="matte-chip">{workflowGuards[agent.id].lastCostRiskLabel}</span> : null}
                        {workflowGuards[agent.id]?.reanalysisRequired ? <span className="matte-chip">re-analysis</span> : null}
                        {agent.sessionId ? <span className="matte-chip">live session</span> : null}
                        {agent.handoffAgentIds.length > 0 ? <span className="matte-chip">{agent.handoffAgentIds.length} chained</span> : null}
                        {agent.area ? <span className="matte-chip">{agent.area}</span> : null}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                        <div className="rounded-xl border border-border/70 bg-bg-card/40 px-2.5 py-2">
                          <div className="uppercase tracking-[0.14em] text-text-muted">Run</div>
                          <div className="mt-1 truncate text-white">{relativeTime(agent.lastRunAt)}</div>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-bg-card/40 px-2.5 py-2">
                          <div className="uppercase tracking-[0.14em] text-text-muted">Pack</div>
                          <div className="mt-1 truncate text-white">{agent.sourcePack === "native" ? "Native" : "Imported"}</div>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-bg-card/40 px-2.5 py-2">
                          <div className="uppercase tracking-[0.14em] text-text-muted">Mode</div>
                          <div className="mt-1 truncate text-white">{agent.executor}</div>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-1 text-xs leading-5 text-text-secondary">
                        {agent.lastRunSummary || agent.description || agent.systemPrompt}
                      </p>
                    </div>
                    {isBusy ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-text-muted" /> : null}
                  </div>
                </button>
              );
            })}
            {filteredAgents.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-border bg-bg-panel/40 px-4 py-5 text-sm text-text-muted">
                No agents match this filter. Adjust search or select a different status filter.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex min-h-[24rem] flex-1 flex-col gap-4 overflow-y-auto">
        <section className="matte-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="matte-panel-heading">{selectedAgent ? selectedAgent.name : "Selected Agent"}</h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Review runtime and chain state, then dispatch one bounded task.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void saveAgent()}
              disabled={busyMode !== null || !canSave}
              className="matte-action-secondary disabled:opacity-50"
            >
              {busyMode === "save" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Save profile
            </button>
          </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
              <span className="matte-chip">{roleLabel(draft.role)}</span>
              <span className="matte-chip">{draft.executor}</span>
              <span className="matte-chip">backend: {draft.backend}</span>
              <span className="matte-chip">chain: {draft.chainPolicy.replaceAll("_", " ")}</span>
              <span className={`rounded-full border px-2.5 py-1 ${statusTone(draft.status)}`}>
                {draft.status}
              </span>
            {selectedAgent?.lastRunStatus ? (
              <span className={`rounded-full border px-2.5 py-1 ${runTone(selectedAgent.lastRunStatus)}`}>
                {selectedAgent.lastRunStatus}
              </span>
            ) : null}
            {selectedAgent ? (
              <span className="matte-chip">Last run {relativeTime(selectedAgent.lastRunAt)}</span>
            ) : null}
            {selectedAgent && workflowGuards[selectedAgent.id]?.lastCostRiskLabel ? (
              <span className="matte-chip">{workflowGuards[selectedAgent.id].lastCostRiskLabel}</span>
            ) : null}
            {selectedAgent && workflowGuards[selectedAgent.id]?.reanalysisRequired ? (
              <span className="matte-chip">re-analysis required</span>
            ) : null}
              {draft.area.trim() ? <span className="matte-chip">{draft.area.trim()}</span> : null}
              {draft.handoffAgentIds.length > 0 ? (
                <span className="matte-chip">{draft.handoffAgentIds.length} downstream</span>
              ) : null}
              {currentTopics.map((topic) => (
                <span key={topic} className="matte-chip">
                  {topic}
              </span>
            ))}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-bg-card/50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Identity</div>
              <div className="mt-3 text-base font-semibold text-white">{draft.name || "Unnamed agent"}</div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {draft.description.trim() || "No short description yet."}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-bg-card/50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Runtime</div>
              <div className="mt-3 space-y-1 text-sm text-text-secondary">
                <div>Executor: <span className="text-white">{draft.executor}</span></div>
                <div>Backend: <span className="text-white">{draft.backend}</span></div>
                <div>Session: <span className="text-white">{selectedAgent?.sessionId || "none"}</span></div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-bg-card/50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Chain</div>
              <div className="mt-3 space-y-1 text-sm text-text-secondary">
                <div>Policy: <span className="text-white">{draft.chainPolicy.replaceAll("_", " ")}</span></div>
                <div>Downstream: <span className="text-white">{draft.handoffAgentIds.length}</span></div>
                <div>Last result: <span className="text-white">{selectedAgent?.lastRunStatus || "none"}</span></div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-bg-card/50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Context</div>
              <div className="mt-3 space-y-1 text-sm text-text-secondary">
                <div>Pack: <span className="text-white">{selectedAgent?.sourcePack || "native"}</span></div>
                <div>Assets: <span className="text-white">{selectedAgent?.packAssets.length || 0}</span></div>
                <div className="line-clamp-2">Topics: <span className="text-white">{currentTopics.join(", ") || "none"}</span></div>
              </div>
            </div>
          </div>

          {error ? <div className="mt-4 text-sm text-status-error">{error}</div> : null}

          <details className="mt-5 overflow-hidden rounded-2xl border border-border bg-bg-card/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-white">Advanced Settings</div>
                <div className="mt-1 text-xs text-text-muted">
                  Full agent definition, runtime configuration, and imported context.
                </div>
              </div>
              <span className="matte-chip">Expand</span>
            </summary>
            <div className="border-t border-border p-4">
              <div className="grid gap-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Name
                </label>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  className="input-discord"
                  placeholder="Builder"
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Role
                </label>
                <select
                  value={draft.role}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, role: event.target.value as AgentRole }))
                  }
                  className="input-discord"
                >
                  <option value="planner">planner</option>
                  <option value="builder">builder</option>
                  <option value="reviewer">reviewer</option>
                  <option value="researcher">researcher</option>
                  <option value="custom">custom</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Status
                </label>
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, status: event.target.value as AgentStatus }))
                  }
                  className="input-discord"
                >
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg-card/40 p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Runtime Configuration</div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem]">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Description
                </label>
                <input
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  className="input-discord"
                  placeholder="Focused implementation agent for project tasks."
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Executor
                </label>
                <select
                  value={draft.executor}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, executor: event.target.value as AgentExecutor }))
                  }
                  className="input-discord"
                >
                  <option value="openclaw">openclaw</option>
                  <option value="codex">codex</option>
                  <option value="manual">manual</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Backend
                </label>
                <select
                  value={draft.backend}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, backend: event.target.value as AgentDefinition["backend"] }))
                  }
                  className="input-discord"
                >
                  <option value="openclaw">openclaw</option>
                  <option value="agent-orchestrator">agent-orchestrator</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Area
                </label>
                <input
                  value={draft.area}
                  onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))}
                  className="input-discord"
                  placeholder="implementation"
                />
              </div>
            </div>

              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg-card/40 p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Identity + Context</div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Topics
                </label>
                <input
                  value={draft.topicsInput}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, topicsInput: event.target.value }))
                  }
                  className="input-discord"
                  placeholder="automation, openclaw, workflow"
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Model
                </label>
                <input
                  value={draft.model}
                  onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                  className="input-discord"
                  placeholder="optional"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Chain Policy
              </label>
              <select
                value={draft.chainPolicy}
                onChange={(event) => setDraft((current) => ({ ...current, chainPolicy: event.target.value as AgentChainPolicy }))}
                className="input-discord"
              >
                <option value="manual">manual</option>
                <option value="auto_on_success">auto on success</option>
                <option value="auto_always">auto always</option>
                <option value="stop_on_first_failure">stop on first failure</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Handoff Chain
              </label>
              <div className="flex flex-wrap gap-2">
                {agents
                  .filter((agent) => agent.id !== selectedAgent?.id)
                  .slice(0, 12)
                  .map((agent) => {
                    const active = draft.handoffAgentIds.includes(agent.id);
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            handoffAgentIds: active
                              ? current.handoffAgentIds.filter((id) => id !== agent.id)
                              : [...current.handoffAgentIds, agent.id],
                          }))
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                          active
                            ? "border-text-muted/30 bg-bg-panel text-white"
                            : "border-border bg-bg-panel/40 text-text-muted hover:bg-bg-panel"
                        }`}
                      >
                        {agent.name}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                System Prompt
              </label>
              <textarea
                value={draft.systemPrompt}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, systemPrompt: event.target.value }))
                }
                className="input-discord min-h-[10rem] resize-y"
                placeholder="Define how this agent should approach work."
              />
            </div>

            {selectedAgent ? (
              <div className="rounded-2xl border border-border bg-bg-card/50 p-4 text-xs text-text-secondary">
                <div className="flex flex-wrap gap-2 pb-3">
                  {([
                    ["overview", "Overview"],
                    ["workflow", "Workflow"],
                    ["playbook", "Playbook"],
                    ["references", "References"],
                  ] as Array<[ContextTab, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setContextTab(key)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        contextTab === key
                          ? "border-text-muted/30 bg-bg-panel text-white"
                          : "border-border bg-bg-panel/40 text-text-muted hover:bg-bg-panel"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {contextTab === "overview" ? (
                  <div className="space-y-1">
                    <div>Source pack: <span className="text-white">{selectedAgent.sourcePack}</span></div>
                    <div>Source ref: <span className="text-white">{selectedAgent.sourceRef || "none"}</span></div>
                    <div>Backend: <span className="text-white">{selectedAgent.backend}</span></div>
                    <div>Session: <span className="text-white">{selectedAgent.sessionId || "none"}</span></div>
                    <div>Pack assets: <span className="text-white">{selectedAgent.packAssets.length}</span></div>
                    <div>Handoff chain: <span className="text-white">{selectedAgent.handoffAgentIds.join(", ") || "none"}</span></div>
                    <div>Topics: <span className="text-white">{selectedAgent.topics.join(", ") || "none"}</span></div>
                  </div>
                ) : null}

                {contextTab === "workflow" ? (
                  <div className="space-y-1">
                    <div>Mode: <span className="text-white">{selectedAgent.workflowProfile.mode}</span></div>
                    <div className="pt-1">Objectives: {selectedAgent.workflowProfile.objectives.join("; ") || "none"}</div>
                    <div>Constraints: {selectedAgent.workflowProfile.constraints.join("; ") || "none"}</div>
                    <div>Deliverables: {selectedAgent.workflowProfile.deliverables.join("; ") || "none"}</div>
                  </div>
                ) : null}

                {contextTab === "playbook" ? (
                  <div className="space-y-2">
                    {assetPreviewsLoading ? <div>Loading playbook previews...</div> : null}
                    {!assetPreviewsLoading && playbookAssets.length > 0 ? playbookAssets.map((asset) => (
                      <details key={asset.path} className="rounded-lg border border-border/70 bg-bg-panel/40 px-2 py-2">
                        <summary className="cursor-pointer text-white">{asset.label}</summary>
                        <div className="mt-1 truncate text-[11px] text-text-muted">{asset.kind}: {asset.path}</div>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-black/20 p-2 text-[11px] leading-5 text-text-secondary">{asset.preview}</pre>
                      </details>
                    )) : null}
                    {!assetPreviewsLoading && playbookAssets.length === 0 ? <div>No playbook previews found.</div> : null}
                  </div>
                ) : null}

                {contextTab === "references" ? (
                  <div className="space-y-2">
                    {assetPreviewsLoading ? <div>Loading reference previews...</div> : null}
                    {!assetPreviewsLoading && referenceAssets.length > 0 ? referenceAssets.map((asset) => (
                      <details key={asset.path} className="rounded-lg border border-border/70 bg-bg-panel/40 px-2 py-2">
                        <summary className="cursor-pointer text-white">{asset.label}</summary>
                        <div className="mt-1 truncate text-[11px] text-text-muted">{asset.kind}: {asset.path}</div>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-black/20 p-2 text-[11px] leading-5 text-text-secondary">{asset.preview}</pre>
                      </details>
                    )) : null}
                    {!assetPreviewsLoading && referenceAssets.length === 0 ? <div>No reference previews found.</div> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            </div>
          </div>
          </details>
        </section>

        <section className="matte-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="matte-panel-heading">Task Dispatch</h3>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Send one focused task through the selected agent. Keep it bounded, verifiable, and short enough to review quickly.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {TASK_SPARKS.map((spark) => (
                  <button
                    key={spark}
                    type="button"
                    onClick={() =>
                      setTaskInput((current) => (current.trim() ? `${current.trim()}\n\n${spark}` : spark))
                    }
                    className="flex items-center gap-1 rounded-full border border-border bg-bg-panel/60 px-2.5 py-1 text-xs text-text-muted transition hover:bg-bg-card hover:text-white"
                  >
                    <Sparkles className="h-3 w-3" />
                    {spark.slice(0, 34)}...
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (visibleDispatch?.brief) {
                    void navigator.clipboard.writeText(visibleDispatch.brief);
                  }
                }}
                disabled={!visibleDispatch?.brief}
                className="matte-action-secondary disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                Copy Brief
              </button>
              <button
                type="button"
                onClick={() => void dispatchAgent()}
                disabled={busyMode !== null || !canDispatch}
                className="matte-action-primary disabled:opacity-50"
              >
                {busyMode === "dispatch" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {selectedAgent?.backend === "agent-orchestrator" ? "Spawn via AO" : "Send to OpenClaw"}
              </button>
            </div>
          </div>

          <div className="mt-5">
            <textarea
              value={taskInput}
              onChange={(event) => setTaskInput(event.target.value)}
              className="input-discord min-h-[10rem] resize-y"
              placeholder="Review the current automations UX, fix one high-value issue, and return changed files plus verification."
            />
            <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
              <span>{taskInput.trim() ? "Ready to dispatch" : "Add a focused task to enable dispatch"}</span>
              <span>{taskInput.length} chars</span>
            </div>
            {selectedAgent?.backend === "agent-orchestrator" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void refreshBackendStatus()} className="matte-action-secondary" disabled={backendStatusLoading || busyMode !== null}>
                  {backendStatusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  AO Status
                </button>
                <button type="button" onClick={() => void sendFollowUpToSession()} className="matte-action-secondary" disabled={busyMode !== null || !selectedAgent?.sessionId || !taskInput.trim()}>
                  <Send className="h-4 w-4" />
                  Send Follow-up
                </button>
                <button type="button" onClick={() => void restoreBackendSession()} className="matte-action-secondary" disabled={busyMode !== null || !selectedAgent?.sessionId}>
                  <RotateCcw className="h-4 w-4" />
                  Restore Session
                </button>
                <button type="button" onClick={() => void clearBackendSession()} className="matte-action-secondary" disabled={busyMode !== null || !selectedAgent?.sessionId}>
                  <Trash2 className="h-4 w-4" />
                  Clear Session
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="matte-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="matte-panel-heading">Run Output</h3>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Review backend status, the latest result, and any downstream handoff timeline from this agent.
              </p>
            </div>
            {latestRunTimeline?.reportHref ? (
              <Link href={latestRunTimeline.reportHref} className="matte-action-secondary">
                <CheckCircle2 className="h-4 w-4" />
                Open Report
              </Link>
            ) : null}
          </div>

          {selectedAgent?.backend === "agent-orchestrator" && backendStatus ? (
            <div className="mt-4 rounded-2xl border border-border bg-bg-card/50 p-4 text-sm text-text-secondary">
              <div className="font-semibold text-white">AO Session Status</div>
              <div className="mt-1">Session: {backendStatus.sessionId || selectedAgent.sessionId || "none"}</div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-text-muted">{backendStatus.body || "(no status output)"}</pre>
              {backendSessions?.body ? (
                <details className="mt-3 rounded-xl border border-border/70 bg-bg-panel/50 p-2">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Session List</summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-text-muted">{backendSessions.body}</pre>
                </details>
              ) : null}
            </div>
          ) : null}

          {latestRunTimeline ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-border bg-bg-card/60 p-4">
                <div className="text-sm font-semibold text-white">Latest Result</div>
                <div className="mt-2 text-sm text-text-secondary">{latestRunTimeline.summary}</div>
                {latestRunTimeline.brief ? (
                  <pre className="mt-4 overflow-x-auto rounded-2xl border border-border bg-bg-panel/70 p-4 text-xs leading-6 text-text-secondary">
                    {latestRunTimeline.brief}
                  </pre>
                ) : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]">
                <div className="rounded-2xl border border-border bg-bg-panel/40 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Latest Run</div>
                  <div className="mt-2 text-sm text-text-secondary">
                    Backend: <span className="text-white">{latestRunTimeline.backend}</span>
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    Session ID: <span className="text-white">{latestRunTimeline.sessionId || "none"}</span>
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    Run status: <span className="text-white">{latestRunTimeline.runStatus || "none"}</span>
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    Policy: <span className="text-white">{latestRunTimeline.chainPolicy.replaceAll("_", " ")}</span>
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    Steps: <span className="text-white">{1 + latestRunTimeline.handoffs.length}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-bg-panel/40 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Latest Run Timeline</div>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-border/70 bg-bg-card/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">{selectedAgent?.name || "Primary agent"}</div>
                        <span className="rounded-full border border-status-info/25 bg-status-info/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-status-info">
                          primary
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">{latestRunTimeline.summary}</div>
                      <div className="mt-1 text-[11px] text-text-muted">backend: {latestRunTimeline.backend}</div>
                      <div className="mt-1 text-[11px] text-text-muted">session: {latestRunTimeline.sessionId || "none"}</div>
                      <div className="mt-1 text-[11px] text-text-muted">status: {latestRunTimeline.runStatus || "none"}</div>
                    </div>
                    {latestRunTimeline.handoffs.length > 0 ? latestRunTimeline.handoffs.map((handoff, index) => (
                      <div key={`${handoff.agentId}-${index}`} className="rounded-xl border border-border/70 bg-bg-card/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-white">{handoff.name}</div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${handoff.ok ? "border-status-success/25 bg-status-success/10 text-status-success" : "border-status-error/25 bg-status-error/10 text-status-error"}`}>
                            {handoff.ok ? "ok" : "failed"}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-text-secondary">{handoff.summary}</div>
                        {handoff.sessionId ? <div className="mt-1 text-[11px] text-text-muted">session: {handoff.sessionId}</div> : null}
                      </div>
                    )) : (
                      <div className="text-xs text-text-muted">Chain/handoff results: no automatic downstream handoffs were executed.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : timelineLoading ? (
            <div className="mt-4 rounded-2xl border border-border bg-bg-card/30 p-5 text-sm text-text-muted">
              Loading latest run timeline...
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-bg-card/30 p-5 text-sm text-text-muted">
              No run output yet. Dispatch one task to see runtime and chain results here.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
