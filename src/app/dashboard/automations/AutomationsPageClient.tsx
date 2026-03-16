"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  PauseCircle,
  Play,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import WorkspaceRunsPanel from "./WorkspaceRunsPanel";
import {
  AUTOMATION_TEMPLATE_PRESETS,
  DEFAULT_N8N_WEBHOOK_PATH,
  type AutomationTemplatePreset,
} from "@/lib/automation-template-presets";
import { normalizeTopics } from "@/lib/topics";

type AutomationExecutor = "codex" | "openclaw" | "n8n";
type AutomationExecutionEnv = "worktree" | "local";
type AutomationTemplateStatus = "active" | "paused";
type AutomationRunStatus = "ready" | "queued" | "dispatched" | "success" | "warning" | "error";
type BusyMode = "save" | "delete" | "run" | "execute" | "toggle" | "check" | null;

interface AutomationTemplate {
  id: string;
  name: string;
  prompt: string;
  executor: AutomationExecutor;
  executionEnv: AutomationExecutionEnv;
  status: AutomationTemplateStatus;
  area: string | null;
  webhookPath: string | null;
  topics: string[];
  lastRunAt: string | null;
  lastRunStatus: AutomationRunStatus | null;
  lastRunSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RunResult {
  templateId: string;
  kind: "task" | "evaluation";
  brief: string;
  summary: string;
  executorPayload: Record<string, unknown>;
  reportHref: string;
  reportId: string;
  evaluation?: TemplateEvaluationResult;
}

interface TemplateRunHistoryItem {
  id: string;
  mode: "prepare" | "execute" | "evaluate";
  status: "queued" | "dispatched" | "success" | "warning" | "error";
  summary: string | null;
  targetUrl: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateEvaluationFinding {
  severity: "info" | "warning" | "error";
  title: string;
  detail: string;
}

interface TemplateEvaluationResult {
  score: number;
  summary: string;
  recommendedStatus: "success" | "warning" | "error";
  findings: TemplateEvaluationFinding[];
}

interface OpenClawHealth {
  ok: boolean;
  status: number;
  body: string;
  agentId: string;
}

interface WorkflowGuardBadgeState {
  scopeId: string;
  reanalysisRequired: boolean;
  lastCostRiskLabel: string;
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

interface AutomationsPageClientProps {
  initialProject: {
    id: string;
    name: string;
    relativePath: string;
  };
  initialTemplates: AutomationTemplate[];
  evalGuard: EvalGuardSnapshot;
}

interface AutomationDraft {
  name: string;
  prompt: string;
  executor: AutomationExecutor;
  executionEnv: AutomationExecutionEnv;
  status: AutomationTemplateStatus;
  area: string;
  webhookPath: string;
  topicsInput: string;
}

interface AutomationTemplatePayload {
  name: string;
  prompt: string;
  executor: AutomationExecutor;
  executionEnv: AutomationExecutionEnv;
  status: AutomationTemplateStatus;
  area: string | null;
  webhookPath: string | null;
  topics: string[];
}

interface AgentHandoffContent {
  openclawPrompt: string;
  n8nContext: string;
}

const EXECUTOR_OPTIONS: AutomationExecutor[] = ["codex", "openclaw", "n8n"];
const EXECUTION_ENV_OPTIONS: AutomationExecutionEnv[] = ["worktree", "local"];

function executeLabel(executor: AutomationExecutor) {
  if (executor === "openclaw") return "Send to OpenClaw";
  if (executor === "n8n") return "Queue in n8n";
  return "Generate Task";
}

function executorReadinessLabel(executor: AutomationExecutor, webhookPath: string | null | undefined) {
  if (executor === "n8n") {
    return webhookPath ? "Webhook ready" : "Missing webhook";
  }
  if (executor === "openclaw") {
    return "OpenClaw ready";
  }
  return "Task generation only";
}

function relativeTime(dateValue: string | null) {
  if (!dateValue) {
    return "Never";
  }

  const deltaSeconds = Math.max(
    1,
    Math.floor((Date.now() - new Date(dateValue).getTime()) / 1000),
  );

  if (deltaSeconds < 60) return "just now";
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function emptyDraft(): AutomationDraft {
  return {
    name: "",
    prompt: "",
    executor: "codex",
    executionEnv: "worktree",
    status: "active",
    area: "",
    webhookPath: "",
    topicsInput: "",
  };
}

function withDefaultWebhookPath(draft: AutomationDraft): AutomationDraft {
  if (draft.executor === "n8n") {
    return {
      ...draft,
      webhookPath: draft.webhookPath || DEFAULT_N8N_WEBHOOK_PATH,
    };
  }
  return draft;
}

function draftFromTemplate(template: AutomationTemplate): AutomationDraft {
  return {
    name: template.name,
    prompt: template.prompt,
    executor: template.executor,
    executionEnv: template.executionEnv,
    status: template.status,
    area: template.area || "",
    webhookPath: template.webhookPath || "",
    topicsInput: template.topics.join(", "),
  };
}

function buildDraftPayload(draft: AutomationDraft): AutomationTemplatePayload | null {
  const name = draft.name.trim();
  const prompt = draft.prompt.trim();

  if (!name || !prompt) {
    return null;
  }

  return {
    name,
    prompt,
    executor: draft.executor,
    executionEnv: draft.executionEnv,
    status: draft.status,
    area: draft.area.trim() || null,
    webhookPath:
      draft.executor === "n8n"
        ? draft.webhookPath.trim() || DEFAULT_N8N_WEBHOOK_PATH
        : draft.webhookPath.trim() || null,
    topics: normalizeTopics(draft.topicsInput),
  };
}

function buildAgentHandoffContent(input: {
  project: { name: string; relativePath: string };
  templateName: string;
  payload: AutomationTemplatePayload;
  brief: string;
}): AgentHandoffContent {
  const topicsLine =
    input.payload.topics.length > 0 ? input.payload.topics.join(", ") : "none";

  return {
    openclawPrompt: [
      `Use this automation task for ${input.project.name}.`,
      "",
      "Task",
      input.payload.prompt,
      "",
      "Context",
      `Project: ${input.project.name} (${input.project.relativePath})`,
      `Template: ${input.templateName}`,
      `Area: ${input.payload.area || "none"}`,
      `Topics: ${topicsLine}`,
      `Environment: ${input.payload.executionEnv}`,
      "",
      "Output",
      "Do the work or prepare the best next action, then summarize changed files, verification, and follow-up.",
    ].join("\n"),
    n8nContext: [
      `Automation template: ${input.templateName}`,
      `Project: ${input.project.name}`,
      `Project path: ${input.project.relativePath}`,
      `Executor: ${input.payload.executor}`,
      `Environment: ${input.payload.executionEnv}`,
      `Area: ${input.payload.area || "none"}`,
      `Topics: ${topicsLine}`,
      `Delivery target: ${input.payload.executor === "n8n" ? input.payload.webhookPath || "none" : "openclaw agent"}`,
      "",
      "Generated task brief",
      input.brief,
    ].join("\n"),
  };
}

function runTone(status: AutomationRunStatus | null) {
  switch (status) {
    case "success":
      return "border-status-success/25 bg-status-success/10 text-status-success";
    case "warning":
      return "border-status-warning/25 bg-status-warning/10 text-status-warning";
    case "error":
      return "border-status-error/25 bg-status-error/10 text-status-error";
    case "queued":
    case "dispatched":
      return "border-status-info/25 bg-status-info/10 text-status-info";
    case "ready":
      return "border-border bg-bg-panel text-text-secondary";
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

function shouldShowAdvanced(
  template: Pick<AutomationTemplate, "area" | "webhookPath" | "topics"> | null,
) {
  if (!template) return false;
  return Boolean(template.area || template.webhookPath || template.topics.length > 0);
}

export default function AutomationsPageClient({
  initialProject,
  initialTemplates,
  evalGuard,
}: AutomationsPageClientProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | "new">(
    initialTemplates[0]?.id || "new",
  );
  const [draft, setDraft] = useState<AutomationDraft>(
    initialTemplates[0] ? draftFromTemplate(initialTemplates[0]) : emptyDraft(),
  );
  const [busyMode, setBusyMode] = useState<BusyMode>(null);
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [showAdvancedFields, setShowAdvancedFields] = useState(
    shouldShowAdvanced(initialTemplates[0] || null),
  );
  const [runHistory, setRunHistory] = useState<TemplateRunHistoryItem[]>([]);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [openClawHealth, setOpenClawHealth] = useState<OpenClawHealth | null>(null);
  const [openClawHealthLoading, setOpenClawHealthLoading] = useState(false);
  const [workflowGuards, setWorkflowGuards] = useState<Record<string, WorkflowGuardBadgeState>>({});

  const sortedTemplates = useMemo(
    () =>
      [...templates].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [templates],
  );

  const selectedTemplate = useMemo(
    () => sortedTemplates.find((template) => template.id === selectedId) ?? null,
    [selectedId, sortedTemplates],
  );

  const filteredTemplates = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    if (!query) return sortedTemplates;

    return sortedTemplates.filter((template) => {
      const haystack = [
        template.name,
        template.prompt,
        template.executor,
        template.executionEnv,
        template.area || "",
        template.webhookPath || "",
        ...template.topics,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [libraryQuery, sortedTemplates]);

  const visibleRunResult =
    runResult && runResult.templateId === selectedTemplate?.id ? runResult : null;

  const summary = useMemo(() => {
    const active = templates.filter((template) => template.status === "active").length;
    const readyToExecute = templates.filter(
      (template) =>
        template.executor === "openclaw" ||
        (template.executor === "n8n" && Boolean(template.webhookPath)),
    ).length;
    const recentlyRun = templates.filter((template) => {
      if (!template.lastRunAt) return false;
      return Date.now() - new Date(template.lastRunAt).getTime() < 1000 * 60 * 60 * 24 * 7;
    }).length;

    return { active, readyToExecute, recentlyRun };
  }, [templates]);

  const currentPayload = buildDraftPayload(draft);
  const currentTopics = normalizeTopics(draft.topicsInput);
  const canPrepare = Boolean(currentPayload) && draft.status !== "paused";
  const canExecute =
    Boolean(currentPayload) &&
    draft.status !== "paused" &&
    (draft.executor === "n8n" || (draft.executor === "openclaw" && openClawHealth?.ok === true));
  const canCheck = Boolean(currentPayload);
  const visibleHandoff =
    visibleRunResult?.kind === "task" && visibleRunResult && currentPayload
      ? buildAgentHandoffContent({
          project: initialProject,
          templateName: selectedTemplate?.name || draft.name.trim() || "Untitled Template",
          payload: currentPayload,
          brief: visibleRunResult.brief,
        })
      : null;

  function beginBusy(mode: Exclude<BusyMode, null>, templateId: string | null = null) {
    setBusyMode(mode);
    setBusyTemplateId(templateId);
  }

  function clearBusy() {
    setBusyMode(null);
    setBusyTemplateId(null);
  }

  function startCreate() {
    setSelectedId("new");
    setDraft(emptyDraft());
    setShowAdvancedFields(false);
    setRunResult(null);
    setError("");
  }

  function updateExecutor(executor: AutomationExecutor) {
    setDraft((current) => withDefaultWebhookPath({ ...current, executor }));
  }

  function applyPreset(preset: AutomationTemplatePreset) {
    setSelectedId("new");
    setShowAdvancedFields(true);
    setDraft(
      withDefaultWebhookPath({
        name: preset.name,
        prompt: preset.prompt,
        executor: preset.executor,
        executionEnv: preset.executionEnv,
        status: "active",
        area: preset.area,
        webhookPath: preset.webhookPath || "",
        topicsInput: preset.topics.join(", "),
      }),
    );
    setError("");
  }

  function selectTemplate(template: AutomationTemplate) {
    setSelectedId(template.id);
    setDraft(draftFromTemplate(template));
    setShowAdvancedFields(shouldShowAdvanced(template));
    setError("");
  }

  function duplicateTemplate(template: AutomationTemplate) {
    setSelectedId("new");
    setShowAdvancedFields(true);
    setDraft({
      name: `${template.name} Copy`,
      prompt: template.prompt,
      executor: template.executor,
      executionEnv: template.executionEnv,
      status: template.status,
      area: template.area || "",
      webhookPath: template.webhookPath || "",
      topicsInput: template.topics.join(", "),
    });
    setError("");
  }

  function syncTemplate(template: AutomationTemplate) {
    setTemplates((current) => {
      const existingIndex = current.findIndex((item) => item.id === template.id);
      if (existingIndex === -1) {
        return [template, ...current];
      }

      const next = [...current];
      next[existingIndex] = template;
      return next;
    });
    setSelectedId(template.id);
    setDraft(draftFromTemplate(template));
    setShowAdvancedFields(shouldShowAdvanced(template));
  }

  async function persistDraftFromEditor() {
    const payload = buildDraftPayload(draft);

    if (!payload) {
      setError("Name and prompt are required.");
      return null;
    }

    let template: AutomationTemplate | undefined;

    if (selectedTemplate) {
      const response = await axios.put(
        `/api/automation/templates/${selectedTemplate.id}`,
        payload,
      );
      template = response.data?.template as AutomationTemplate | undefined;
    } else {
      const response = await axios.post("/api/automation/templates", payload);
      template = response.data?.template as AutomationTemplate | undefined;
    }

    if (!template) {
      throw new Error("Template response missing.");
    }

    syncTemplate(template);
    return template;
  }

  async function saveTemplate() {
    try {
      beginBusy("save", selectedTemplate?.id ?? null);
      await persistDraftFromEditor();
      setError("");
    } catch {
      setError("Unable to save automation template.");
    } finally {
      clearBusy();
    }
  }

  async function deleteTemplate(id: string) {
    try {
      beginBusy("delete", id);
      await axios.delete(`/api/automation/templates/${id}`);

      const nextTemplates = templates.filter((item) => item.id !== id);
      setTemplates(nextTemplates);

      if (selectedId === id) {
        if (nextTemplates[0]) {
          selectTemplate(nextTemplates[0]);
        } else {
          startCreate();
        }
      }

      if (runResult?.templateId === id) {
        setRunResult(null);
      }

      setError("");
    } catch {
      setError("Unable to delete automation template.");
    } finally {
      clearBusy();
    }
  }

  async function prepareCurrentDraft() {
    try {
      beginBusy("run", selectedTemplate?.id ?? null);
      const template = await persistDraftFromEditor();
      if (!template) return;

      const response = await axios.post(`/api/automation/templates/${template.id}/run`);
      const updated = response.data?.template as AutomationTemplate | undefined;

      if (updated) {
        syncTemplate(updated);
      }

      setRunResult({
        templateId: template.id,
        kind: "task",
        brief: String(response.data?.run?.brief || ""),
        summary: String(response.data?.run?.summary || "Run prepared."),
        executorPayload:
          response.data?.run?.executorPayload && typeof response.data.run.executorPayload === "object"
            ? response.data.run.executorPayload
            : {},
        reportHref: String(response.data?.run?.reportHref || "/dashboard/report"),
        reportId: String(response.data?.run?.reportId || ""),
      });
      await loadRunHistory(template.id);
      setError("");
    } catch {
      setError("Unable to prepare automation run.");
    } finally {
      clearBusy();
    }
  }

  async function executeCurrentDraft() {
    try {
      beginBusy("execute", selectedTemplate?.id ?? null);
      const template = await persistDraftFromEditor();
      if (!template) return;

      const response = await axios.post(
        `/api/automation/templates/${template.id}/execute`,
      );
      const updated = response.data?.template as AutomationTemplate | undefined;

      if (updated) {
        syncTemplate(updated);
      }

      setRunResult({
        templateId: template.id,
        kind: "task",
        brief: String(response.data?.run?.brief || ""),
        summary: String(response.data?.run?.summary || "Execution dispatched."),
        executorPayload:
          response.data?.run?.executorPayload && typeof response.data.run.executorPayload === "object"
            ? response.data.run.executorPayload
            : {},
        reportHref: String(response.data?.run?.reportHref || "/dashboard/report"),
        reportId: String(response.data?.run?.reportId || ""),
      });
      await loadRunHistory(template.id);
      setError("");
    } catch {
      setError("Unable to execute automation template.");
    } finally {
      clearBusy();
    }
  }

  async function checkCurrentDraft() {
    try {
      beginBusy("check", selectedTemplate?.id ?? null);
      const template = await persistDraftFromEditor();
      if (!template) return;

      const response = await axios.post(
        `/api/automation/templates/${template.id}/check`,
      );
      const updated = response.data?.template as AutomationTemplate | undefined;

      if (updated) {
        syncTemplate(updated);
      }

      const evaluation =
        response.data?.evaluation && typeof response.data.evaluation === "object"
          ? (response.data.evaluation as TemplateEvaluationResult)
          : null;

      setRunResult({
        templateId: template.id,
        kind: "evaluation",
        brief: "",
        summary: String(response.data?.evaluation?.summary || "Template check completed."),
        executorPayload: {},
        reportHref: "",
        reportId: "",
        evaluation: evaluation || undefined,
      });
      await loadRunHistory(template.id);
      setError("");
    } catch {
      setError("Unable to check automation template.");
    } finally {
      clearBusy();
    }
  }

  async function toggleTemplateStatus(template: AutomationTemplate) {
    try {
      beginBusy("toggle", template.id);
      const response = await axios.put(`/api/automation/templates/${template.id}`, {
        status: template.status === "active" ? "paused" : "active",
      });
      const updated = response.data?.template as AutomationTemplate | undefined;
      if (updated) {
        setTemplates((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        if (selectedId === updated.id) {
          selectTemplate(updated);
        }
      }
      setError("");
    } catch {
      setError("Unable to update automation template status.");
    } finally {
      clearBusy();
    }
  }

  async function copyBrief() {
    if (!visibleRunResult?.brief) return;
    await navigator.clipboard.writeText(visibleRunResult.brief);
  }

  async function copyOpenClawPrompt() {
    if (!visibleHandoff) return;
    await navigator.clipboard.writeText(visibleHandoff.openclawPrompt);
  }

  async function copyN8nContext() {
    if (!visibleHandoff) return;
    await navigator.clipboard.writeText(visibleHandoff.n8nContext);
  }

  async function loadRunHistory(templateId: string) {
    try {
      setRunHistoryLoading(true);
      const response = await axios.get(`/api/automation/templates/${templateId}/runs`);
      const rows = Array.isArray(response.data?.runs) ? response.data.runs : [];
      setRunHistory(rows as TemplateRunHistoryItem[]);
    } catch {
      setRunHistory([]);
    } finally {
      setRunHistoryLoading(false);
    }
  }

  async function refreshOpenClawHealth() {
    try {
      setOpenClawHealthLoading(true);
      const response = await axios.get("/api/automation/openclaw/health");
      if (response.data && typeof response.data === "object") {
        setOpenClawHealth(response.data as OpenClawHealth);
      } else {
        setOpenClawHealth({ ok: false, status: 500, body: "Invalid OpenClaw health response.", agentId: "unknown" });
      }
    } catch (error) {
      const body = axios.isAxiosError(error)
        ? String(error.response?.data?.msg || error.response?.data?.body || error.message)
        : "OpenClaw health check failed.";
      setOpenClawHealth({ ok: false, status: 503, body, agentId: "unknown" });
    } finally {
      setOpenClawHealthLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedTemplate?.id) {
      setRunHistory([]);
      return;
    }
    void loadRunHistory(selectedTemplate.id);
  }, [selectedTemplate?.id]);

  useEffect(() => {
    if (draft.executor !== "openclaw") return;
    void refreshOpenClawHealth();
  }, [draft.executor]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/workflow/guards", { params: { scope: "automation" } })
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
  }, [templates.length]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/workflow/guards", { params: { scope: "automation" } })
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
  }, [templates.length]);

  return (
    <div className="matte-page mx-auto flex h-full w-full max-w-6xl overflow-y-auto px-6 py-8 sm:px-10">
      <div className="flex w-full flex-col gap-4">
        <section className="matte-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="matte-icon-frame">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 data-testid="automations-page-title" className="matte-page-title text-[1.5rem]">Automations</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">
                  Reusable task recipes for {initialProject.name}. Keep them small, scoped, and ready
                  to hand off to OpenClaw when needed.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="matte-chip">{summary.active} active</span>
              <span className="matte-chip">{summary.readyToExecute} executable</span>
              <span className="matte-chip">{summary.recentlyRun} ran this week</span>
            </div>
          </div>
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${evalGuardTone(evalGuard.status)}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]">Eval guard</div>
            <div className="mt-1 font-semibold">{evalGuard.promotionStatus}</div>
            <div className="mt-1 text-xs">score {evalGuard.metrics.score} · failure {evalGuard.metrics.failureRate}</div>
            <div className="mt-1 text-xs">latest {evalGuard.timestamp ? relativeTime(evalGuard.timestamp) : "unavailable"}</div>
          </div>
        </section>

        <WorkspaceRunsPanel projectId={initialProject.id} />

        <section className="matte-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="matte-panel-heading">Task Recipes</h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Use a preset to start fast, or pick an existing recipe to reuse it.
              </p>
            </div>
            <div className="flex min-w-[18rem] max-w-md items-center gap-2 rounded-xl border border-border bg-bg-panel/45 px-3 py-2">
              <Search className="h-4 w-4 text-text-muted" />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-text-muted"
                placeholder="Search recipes..."
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {AUTOMATION_TEMPLATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-full border border-border bg-bg-panel/45 px-3 py-2 text-sm text-white transition hover:border-text-muted/18 hover:bg-bg-card"
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="mt-4 max-h-[16rem] overflow-y-auto pr-1">
            {filteredTemplates.length === 0 ? (
              <div className="matte-empty">
                {templates.length === 0
                  ? "No saved recipes yet. Start from a preset."
                  : "No recipes match the current search."}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredTemplates.map((template) => {
                  const isSelected = template.id === selectedTemplate?.id;
                  const isBusy = busyTemplateId === template.id && busyMode !== null;

                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => selectTemplate(template)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        isSelected
                          ? "border-text-muted/25 bg-bg-card shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                          : "border-border bg-bg-panel/45 hover:border-text-muted/18 hover:bg-bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-white">{template.name}</div>
                            <span className="matte-chip">{template.executor}</span>
                            {workflowGuards[template.id]?.lastCostRiskLabel ? <span className="matte-chip">{workflowGuards[template.id].lastCostRiskLabel}</span> : null}
                            {workflowGuards[template.id]?.reanalysisRequired ? <span className="matte-chip">re-analysis</span> : null}
                            {template.area ? <span className="matte-chip">{template.area}</span> : null}
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                            {template.prompt}
                          </p>
                          <div className="mt-2 text-xs text-text-muted">
                            {template.lastRunStatus
                              ? `${template.lastRunStatus} · ${relativeTime(template.lastRunAt)}`
                              : `Updated ${relativeTime(template.updatedAt)}`}
                          </div>
                        </div>
                        {isBusy ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-text-muted" /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        <section className="matte-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="matte-panel-heading">
                {selectedTemplate ? selectedTemplate.name : draft.name.trim() || "New Task Recipe"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                One goal, one scope, one expected output. That is enough.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void checkCurrentDraft()}
                disabled={busyMode !== null || !canCheck}
                className="matte-action-secondary disabled:opacity-50"
              >
                {busyMode === "check" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Check
              </button>
              <button
                type="button"
                onClick={() => void prepareCurrentDraft()}
                disabled={busyMode !== null || !canPrepare}
                className="matte-action-secondary disabled:opacity-50"
              >
                {busyMode === "run" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Generate Task
              </button>
              <button
                type="button"
                onClick={() => void executeCurrentDraft()}
                disabled={busyMode !== null || !canExecute}
                className="matte-action-primary disabled:opacity-50"
              >
                {busyMode === "execute" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {executeLabel(draft.executor)}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
            <span className="matte-chip">{selectedTemplate ? "saved recipe" : "draft"}</span>
            <span className="matte-chip">{draft.executor}</span>
            <span className="matte-chip">{draft.executionEnv}</span>
            {selectedTemplate ? (
              <span className="matte-chip">last run {relativeTime(selectedTemplate.lastRunAt)}</span>
            ) : null}
            {selectedTemplate && workflowGuards[selectedTemplate.id]?.lastCostRiskLabel ? (
              <span className="matte-chip">{workflowGuards[selectedTemplate.id].lastCostRiskLabel}</span>
            ) : null}
            {selectedTemplate && workflowGuards[selectedTemplate.id]?.reanalysisRequired ? (
              <span className="matte-chip">re-analysis required</span>
            ) : null}
            {draft.executor === "n8n" ? (
              <span className="matte-chip">
                {executorReadinessLabel("n8n", currentPayload?.webhookPath)}
              </span>
            ) : draft.executor === "openclaw" ? (
              <span className="matte-chip">
                {openClawHealthLoading
                  ? "checking OpenClaw..."
                  : openClawHealth?.ok
                    ? "OpenClaw ready"
                    : "OpenClaw unavailable"}
              </span>
            ) : (
              <span className="matte-chip">task generation only</span>
            )}
          </div>

          <div className="mt-6 space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_11rem_11rem]">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Name
                </label>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  className="input-discord"
                  placeholder="Small targeted refactor"
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Executor
                </label>
                <select
                  value={draft.executor}
                  onChange={(event) => updateExecutor(event.target.value as AutomationExecutor)}
                  className="input-discord"
                >
                  {EXECUTOR_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Environment
                </label>
                <select
                  value={draft.executionEnv}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      executionEnv: event.target.value as AutomationExecutionEnv,
                    }))
                  }
                  className="input-discord"
                >
                  {EXECUTION_ENV_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Prompt
              </label>
              <textarea
                value={draft.prompt}
                onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
                className="input-discord min-h-[12rem] resize-y"
                placeholder="Review the current automation UX, fix one high-value issue, and return changed files plus verification."
              />
              <p className="mt-2 text-xs text-text-muted">Good format: goal, scope, expected output.</p>
            </div>

            <details className="rounded-xl border border-border bg-bg-panel/35 p-3" open={showAdvancedFields}>
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  setShowAdvancedFields((current) => !current);
                }}
                className="flex cursor-pointer items-center justify-between text-left"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Details
                </span>
                {showAdvancedFields ? (
                  <ChevronUp className="h-4 w-4 text-text-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-muted" />
                )}
              </summary>

              {showAdvancedFields ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Area
                    </label>
                    <input
                      value={draft.area}
                      onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))}
                      className="input-discord"
                      placeholder="automation"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Status
                    </label>
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          status: event.target.value as AutomationTemplateStatus,
                        }))
                      }
                      className="input-discord"
                    >
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Topics
                    </label>
                    <input
                      value={draft.topicsInput}
                      onChange={(event) => setDraft((current) => ({ ...current, topicsInput: event.target.value }))}
                      className="input-discord"
                      placeholder="refactor, docs"
                    />
                  </div>
                  {draft.executor === "n8n" ? (
                    <div className="lg:col-span-3">
                      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                        n8n Webhook Path
                      </label>
                      <input
                        value={draft.webhookPath}
                        onChange={(event) => setDraft((current) => ({ ...current, webhookPath: event.target.value }))}
                        className="input-discord"
                        placeholder="/webhook/mission-control/openclaw-router"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </details>

            {error ? <div className="text-sm text-status-error">{error}</div> : null}
            {draft.executor === "openclaw" && openClawHealth && !openClawHealth.ok ? (
              <div className="text-sm text-status-warning">
                OpenClaw preflight failed: {openClawHealth.body || "OpenClaw is unavailable."}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveTemplate()}
                  disabled={busyMode !== null}
                  className="matte-action-secondary disabled:opacity-50"
                >
                  {busyMode === "save" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Recipe
                </button>
                <button type="button" onClick={startCreate} className="matte-action-secondary">
                  Clear Draft
                </button>
                {draft.executor === "openclaw" ? (
                  <button
                    type="button"
                    onClick={() => void refreshOpenClawHealth()}
                    disabled={busyMode !== null || openClawHealthLoading}
                    className="matte-action-secondary disabled:opacity-50"
                  >
                    {openClawHealthLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Check OpenClaw
                  </button>
                ) : null}
              </div>

              {selectedTemplate ? (
                <details className="rounded-xl border border-border bg-bg-panel/30 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                    Recipe controls
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => duplicateTemplate(selectedTemplate)}
                      disabled={busyMode !== null}
                      className="matte-action-secondary disabled:opacity-50"
                    >
                      <Copy className="h-4 w-4" />
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleTemplateStatus(selectedTemplate)}
                      disabled={busyMode !== null}
                      className="matte-action-secondary disabled:opacity-50"
                    >
                      {busyMode === "toggle" && busyTemplateId === selectedTemplate.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <PauseCircle className="h-4 w-4" />
                      )}
                      {selectedTemplate.status === "active" ? "Pause" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTemplate(selectedTemplate.id)}
                      disabled={busyMode !== null}
                      className="matte-action-secondary text-status-error hover:border-status-error/30 hover:text-status-error disabled:opacity-50"
                    >
                      {busyMode === "delete" && busyTemplateId === selectedTemplate.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Delete
                    </button>
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        </section>

          <section className="matte-panel p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="matte-panel-heading">Latest Result</h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  The last generated task or template check for the selected recipe.
                </p>
                {selectedTemplate ? (
                  <button
                    type="button"
                    onClick={() => void loadRunHistory(selectedTemplate.id)}
                    className="mt-2 matte-action-secondary"
                    disabled={runHistoryLoading}
                  >
                    {runHistoryLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Refresh
                  </button>
                ) : null}
              </div>
              {visibleRunResult ? (
                <div className="flex flex-wrap gap-2">
                  {visibleRunResult.kind === "task" ? (
                    <>
                      <button type="button" onClick={() => void copyBrief()} className="matte-action-secondary">
                        <Copy className="h-4 w-4" />
                        Copy Brief
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyOpenClawPrompt()}
                        className="matte-action-secondary"
                      >
                        <Copy className="h-4 w-4" />
                        OpenClaw Prompt
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyN8nContext()}
                        className="matte-action-secondary"
                      >
                        <Copy className="h-4 w-4" />
                        n8n Context
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            {visibleRunResult ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-border bg-bg-panel/55 px-4 py-3 text-sm text-text-primary">
                  {visibleRunResult.summary}
                </div>
                {visibleRunResult.kind === "task" && visibleRunResult.reportHref ? (
                  <div className="flex flex-wrap gap-2">
                    <Link href={visibleRunResult.reportHref} className="matte-action-secondary">
                      <Bot className="h-4 w-4" />
                      Open Report
                    </Link>
                  </div>
                ) : null}
                {visibleRunResult.kind === "task" ? (
                  <details className="rounded-xl border border-border bg-bg-panel/40 px-4 py-3" open>
                    <summary className="cursor-pointer text-sm font-semibold text-white">Task Brief</summary>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-[12px] leading-6 text-text-secondary">
                      {visibleRunResult.brief}
                    </pre>
                  </details>
                ) : null}
                {visibleRunResult.kind === "task" && visibleHandoff ? (
                  <details className="rounded-xl border border-border bg-bg-panel/35 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-semibold text-white">Delivery Context</summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                          OpenClaw Prompt
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap text-[12px] leading-6 text-text-secondary">
                          {visibleHandoff.openclawPrompt}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                          n8n Context
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap text-[12px] leading-6 text-text-secondary">
                          {visibleHandoff.n8nContext}
                        </pre>
                      </div>
                    </div>
                  </details>
                ) : null}
                {visibleRunResult.kind === "evaluation" && visibleRunResult.evaluation ? (
                  <div className="rounded-xl border border-border bg-bg-panel/35 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        Score {visibleRunResult.evaluation.score}/100
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${runTone(
                          visibleRunResult.evaluation.recommendedStatus,
                        )}`}
                      >
                        {visibleRunResult.evaluation.recommendedStatus}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {visibleRunResult.evaluation.findings.length === 0 ? (
                        <div className="text-sm text-text-secondary">
                          No issues found. The template is clear enough to reuse as-is.
                        </div>
                      ) : (
                        visibleRunResult.evaluation.findings.map((finding) => (
                          <div
                            key={`${finding.severity}-${finding.title}`}
                            className="rounded-lg border border-border bg-bg-panel/50 px-3 py-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${runTone(
                                  finding.severity === "info"
                                    ? "ready"
                                    : (finding.severity as AutomationRunStatus),
                                )}`}
                              >
                                {finding.severity}
                              </span>
                              <span className="text-sm font-semibold text-white">{finding.title}</span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-text-secondary">
                              {finding.detail}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="matte-empty mt-4">
                {selectedTemplate
                  ? "No generated task or check yet. Run this recipe to inspect the latest result."
                  : "Pick a recipe to inspect its latest result."}
              </div>
            )}

            <details className="mt-4 rounded-xl border border-border bg-bg-panel/30 p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Recent runs
              </summary>
              <div className="mt-3">
                {runHistory.length === 0 ? (
                  <div className="text-xs text-text-muted">No recorded runs for this recipe yet.</div>
                ) : (
                  <div className="space-y-2">
                    {runHistory.slice(0, 6).map((run) => (
                      <div key={run.id} className="rounded-lg border border-border bg-bg-panel/50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full border px-2 py-0.5 ${runTone(run.status as AutomationRunStatus)}`}>
                            {run.status}
                          </span>
                          <span className="rounded-full border border-border px-2 py-0.5 text-text-muted">{run.mode}</span>
                          <span className="text-text-muted">{relativeTime(run.createdAt)}</span>
                        </div>
                        {run.summary ? <div className="mt-1 text-xs text-text-secondary">{run.summary}</div> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </section>
      </div>
    </div>
  );
}
