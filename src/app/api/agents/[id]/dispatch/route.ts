import { readFile, readdir } from "fs/promises";
import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { getWorkspaceRootPath } from "@/server/projects/workspace-projects";
import { findAgentById, recordAgentRun, updateAgent } from "@/server/repositories/agents-repo";
import type { AgentDefinition } from "@/types/agents";
import { createReport } from "@/server/repositories/reports-repo";
import { dispatchToOpenClawAgent, validateOpenClawPreflightPaths } from "@/server/services/openclaw-delivery-service";
import { spawnAgentOrchestratorRun } from "@/server/services/agent-orchestrator-service";
import type { AgentChainPolicy } from "@/types/agents";
import { buildAgentDispatchMetadata } from "@/lib/agents/dispatch-metadata";
import { buildExecutionPacket, type ContextBlock } from "@/lib/workflow/mission-control-workflow";
import { buildAgentProfileDispatchDirectives } from "@/lib/agents/agent-profiles";
import { appendLessonEvent, loadLessonHint } from "@/server/services/workflow-lessons-service";
import { recordWorkflowRunOutcome, upsertWorkflowRunSignature } from "@/server/repositories/workflow-run-guards-repo";
import { getAgentEvalGuardSnapshot, type AgentEvalGuardSnapshot } from "@/server/services/agent-eval-guard-service";
import {
  buildTaskQualityPayload,
  createTaskQualityNormalizedError,
  validateTaskQualityPayload,
} from "@/server/services/task-quality-guardrails";
import { findWorkspaceRunById, updateWorkspaceRun } from "@/server/repositories/workspace-runs-repo";
import {
  createWorkspaceRunDispatch,
  hasRunningWorkspaceRunDispatch,
  updateWorkspaceRunDispatch,
} from "@/server/repositories/workspace-run-dispatches-repo";
import { verifyRunWorktreePath } from "@/server/services/workspace-run-service";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_STORED_DISPATCH_BODY = 12000;
const inFlightAgentRuns = new Set<string>();
const inFlightRunDispatches = new Set<string>();

type HandoffResult = {
  agentId: string;
  name: string;
  ok: boolean;
  summary: string;
  sessionId: string | null;
};

function buildReliabilityTelemetry(input: {
  endpoint: string;
  source: string;
  success: boolean;
  failureClass?: string | null;
  attempts?: number;
  totalDurationMs?: number;
  modelUsed?: string | null;
  fallbackUsed?: boolean;
}) {
  return {
    timestamp: new Date().toISOString(),
    endpoint: input.endpoint,
    source: input.source,
    failure_class: input.failureClass || null,
    attempts: Number.isFinite(input.attempts) ? Number(input.attempts) : 1,
    total_duration_ms: Number.isFinite(input.totalDurationMs) ? Number(input.totalDurationMs) : 0,
    model_used: input.modelUsed || null,
    fallback_used: Boolean(input.fallbackUsed),
    success: input.success,
  };
}

function buildReportHref(date: string) {
  const day = date.slice(0, 10);
  return day ? `/dashboard/report?day=${encodeURIComponent(day)}` : "/dashboard/report";
}

function truncateDispatchBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length <= MAX_STORED_DISPATCH_BODY) return trimmed;
  return `${trimmed.slice(0, MAX_STORED_DISPATCH_BODY)}\n\n...[truncated ${trimmed.length - MAX_STORED_DISPATCH_BODY} chars]`;
}

function extractOpenClawSummary(parsed: Record<string, unknown> | null, fallback: string) {
  if (!parsed || typeof parsed !== "object") return fallback;

  const result = parsed.result;
  if (!result || typeof result !== "object") return fallback;

  const payloads = (result as { payloads?: unknown }).payloads;
  if (!Array.isArray(payloads) || payloads.length === 0) return fallback;

  const first = payloads[0];
  if (!first || typeof first !== "object") return fallback;

  const text = (first as { text?: unknown }).text;
  return typeof text === "string" && text.trim() ? text.trim() : fallback;
}

async function buildPackSnippets(packAssets: Array<{ label: string; path: string; kind: string }>) {
  const slices: string[] = [];

  for (const asset of packAssets.slice(0, 4)) {
    try {
      if (asset.kind === "directory") {
        const entries = await readdir(asset.path);
        slices.push(`Directory ${asset.label}: ${entries.slice(0, 12).join(", ") || "(empty)"}`);
      } else {
        const content = await readFile(asset.path, "utf8");
        slices.push(`File ${asset.label}:\n${content.slice(0, 1800)}`);
      }
    } catch (error) {
      slices.push(`Asset ${asset.label}: unavailable (${error instanceof Error ? error.message : "unknown error"})`);
    }
  }

  return slices.join("\n\n");
}

async function buildAgentBrief(input: {
  project: { name: string; relativePath: string };
  agent: {
    name: string;
    role: string;
    description: string | null;
    area: string | null;
    topics: string[];
    systemPrompt: string;
    workflowProfile: {
      mode: string;
      objectives: string[];
      constraints: string[];
      deliverables: string[];
    };
    profileId: AgentDefinition["profileId"];
    packAssets: Array<{ label: string; path: string; kind: string }>;
    handoffAgentIds: string[];
    sourcePack: string;
    sourceRef: string | null;
  };
  task: string;
  deepMode?: boolean;
  lessonHint?: { snippets: string[]; ruleSnippets?: string[]; reanalysisRequired: boolean };
}) {
  const workflow = input.agent.workflowProfile;
  const profileDirectives = buildAgentProfileDispatchDirectives(input.agent.profileId);
  const packSnippets = await buildPackSnippets(input.agent.packAssets);
  const contextBlocks: ContextBlock[] = [
    { label: "project", content: `Project: ${input.project.name} (${input.project.relativePath})` },
    { label: "agent", content: `Agent: ${input.agent.name}\nRole: ${input.agent.role}\nArea: ${input.agent.area || "none"}\nTopics: ${input.agent.topics.join(", ") || "none"}` },
    { label: "workflow", content: `Mode: ${workflow.mode}\nObjectives: ${workflow.objectives.join("; ") || "none"}\nConstraints: ${workflow.constraints.join("; ") || "none"}\nDeliverables: ${workflow.deliverables.join("; ") || "none"}` },
    { label: "system-prompt", content: input.agent.systemPrompt.trim() || "No explicit system prompt provided." },
    ...profileDirectives.contextBlocks,
    { label: "pack-snippets", content: packSnippets || "none" },
    { label: "lessons", content: input.lessonHint?.snippets.join("\n") || "none" },
    { label: "lesson-rules", content: input.lessonHint?.ruleSnippets?.join("\n") || "none" },
  ];

  const packet = buildExecutionPacket({
    objective: input.task,
    constraints: [
      "Follow mission-control workflow: objective -> constraints -> execution -> verification -> report.",
      "Do not complete without verification evidence.",
      ...(workflow.constraints || []),
      ...profileDirectives.constraints,
      input.lessonHint?.reanalysisRequired
        ? "Same failure happened twice. Switch to re-analysis mode and produce revised approach before next edit."
        : "",
    ].filter(Boolean),
    executionNotes: [
      "Immediately send: 'Received from Mission Control — starting now.'",
      "Prefer short bounded checks and avoid long-running background jobs.",
      ...(workflow.objectives || []),
      ...profileDirectives.executionNotes,
    ],
    verification: [
      "Run touched checks before completion and cite exact command output.",
      ...profileDirectives.verification,
    ],
    reportFormat: [
      ...profileDirectives.reportFormat,
      "Changed files",
      "Verification outputs",
      "Risks",
      "Next step",
    ],
    contextBlocks,
    deepMode: input.deepMode,
  });

  return packet;
}

function shouldFallbackFromAo(body: string) {
  const normalized = String(body || "").toLowerCase();
  return normalized.includes("no agent-orchestrator.yaml")
    || normalized.includes("unknown project")
    || normalized.includes("tmux is not installed")
    || normalized.includes("must exist in tracker")
    || normalized.includes("already used by worktree");
}

async function runAgentDispatch(input: {
  userId: string;
  project: { id: string; name: string; relativePath: string };
  agent: AgentDefinition;
  task: string;
  deepMode?: boolean;
  lessonHint?: { snippets: string[]; ruleSnippets?: string[]; reanalysisRequired: boolean };
  targetProjectPath?: string;
}) {
  const packet = await buildAgentBrief({
    project: { name: input.project.name, relativePath: input.project.relativePath },
    agent: input.agent,
    task: input.task,
    deepMode: input.deepMode,
    lessonHint: input.lessonHint,
  });

  const brief = `${packet.brief}\n\nCost risk: ${packet.costRisk.label}`;
  const defaultProjectPath = `${getWorkspaceRootPath().replace(/\\/g, "/")}/${input.project.relativePath.replace(/\\/g, "/")}`;
  const projectPath = input.targetProjectPath || defaultProjectPath;
  let dispatch;
  if (input.agent.backend === "agent-orchestrator") {
    const aoDispatch = await spawnAgentOrchestratorRun(projectPath, brief);
    if (aoDispatch.ok || !shouldFallbackFromAo(aoDispatch.body)) {
      dispatch = aoDispatch;
    } else {
      const fallbackBrief = [
        `Run workspace path: ${projectPath}`,
        "Agent-Orchestrator unavailable in current runtime; executing via OpenClaw fallback for bounded continuity.",
        brief,
      ].join("\n\n");
      dispatch = await dispatchToOpenClawAgent({
        brief: fallbackBrief,
        timeoutSeconds: 180,
        thinking: "medium",
      });
    }
  } else {
    dispatch = await dispatchToOpenClawAgent({
      brief,
      timeoutSeconds: 180,
      thinking: "medium",
    });
  }

  const aoSessionId = "sessionId" in dispatch ? dispatch.sessionId : null;
  const dispatchBody = truncateDispatchBody(dispatch.body || "");
  const summary = input.agent.backend === "agent-orchestrator"
    ? `AO session started${aoSessionId ? ` (${aoSessionId})` : ""}.`
    : extractOpenClawSummary((dispatch as { parsed?: Record<string, unknown> | null }).parsed || null, "Task sent to OpenClaw.");

  return { brief, packet, dispatch, aoSessionId, dispatchBody, summary };
}

function createEvalGuardReport(input: {
  userId: string;
  projectId: string;
  agent: { id: string; name: string; area: string | null; topics: string[] };
  guard: AgentEvalGuardSnapshot;
  decision: "blocked" | "degraded" | "unavailable";
}) {
  return createReport(input.userId, input.projectId, {
    title: `Eval guard ${input.decision}: ${input.agent.name}`,
    content: `Status: ${input.guard.status}\nScore: ${input.guard.metrics.score}\nFailure rate: ${input.guard.metrics.failureRate}\nCost USD: ${input.guard.metrics.costUsd}\nArtifact: ${input.guard.artifactPath}\nTimestamp: ${input.guard.timestamp || "none"}\nReasons: ${input.guard.reasons.join(", ") || "none"}`,
    category: input.decision === "blocked" ? "error" : "maintenance",
    status: input.decision === "blocked" ? "error" : "warning",
    area: "agents",
    source: "Mission Control",
    topics: [...input.agent.topics, "agents", "eval-guard"],
    metadata: {
      agentId: input.agent.id,
      evalGuard: input.guard,
      decision: input.decision,
      topic: "eval-guard",
    },
  });
}

function shouldAutoRunHandoffs(policy: AgentChainPolicy, primaryOk: boolean) {
  switch (policy) {
    case "auto_always":
      return true;
    case "auto_on_success":
    case "stop_on_first_failure":
      return primaryOk;
    default:
      return false;
  }
}

async function executeHandoffs(input: {
  userId: string;
  project: { id: string; name: string; relativePath: string };
  agent: AgentDefinition;
  task: string;
  previousSummary: string;
}) {
  const handoffResults: HandoffResult[] = [];

  for (const handoffId of input.agent.handoffAgentIds.slice(0, 4)) {
    const nextAgent = findAgentById(input.userId, input.project.id, handoffId);
    if (!nextAgent || nextAgent.status !== "active") continue;

    const handoffTask = [
      `Handoff from agent: ${input.agent.name}`,
      `Original task: ${input.task}`,
      `Previous result summary: ${input.previousSummary}`,
      "Continue from this result and complete your role in the chain.",
    ].join("\n");

    const downstream = await runAgentDispatch({
      userId: input.userId,
      project: input.project,
      agent: nextAgent,
      task: handoffTask,
    });

    if (nextAgent.backend === "agent-orchestrator" && downstream.aoSessionId) {
      updateAgent(input.userId, input.project.id, nextAgent.id, {
        sessionId: downstream.aoSessionId,
        backend: "agent-orchestrator",
      });
    }

    recordAgentRun(
      input.userId,
      input.project.id,
      nextAgent.id,
      nextAgent.backend === "agent-orchestrator" ? "running" : downstream.dispatch.ok ? "dispatched" : "error",
      downstream.summary,
    );

    handoffResults.push({
      agentId: nextAgent.id,
      name: nextAgent.name,
      ok: downstream.dispatch.ok,
      summary: downstream.summary,
      sessionId: downstream.aoSessionId,
    });

    if (input.agent.chainPolicy === "stop_on_first_failure" && !downstream.dispatch.ok) {
      break;
    }
  }

  return handoffResults;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;
    const body = await req.json();
    const task = String(body.task || "").trim();
    const deepMode = Boolean(body.deepMode);
    const runId = String(body.runId || "").trim() || null;

    if (!id) {
      return badRequest("Agent ID is required.");
    }
    if (!task) {
      return badRequest("Task is required.");
    }

    const taskQualityPayload = buildTaskQualityPayload({
      objective: task,
      scope: `Agent dispatch scoped to ${id}. Keep changes bounded to the stated task and current project.`,
      verificationSteps: [
        "Run validation commands tied to touched files and capture raw output.",
      ],
      rollbackPlan: [
        "If checks fail or scope drifts, stop execution and fall back to reporting the blocker before retry.",
      ],
      outputExpectation: [
        "Return only bounded outputs: changed files, verification output, and next step summary (max 3 bullets each).",
      ],
    });
    const taskQuality = validateTaskQualityPayload(taskQualityPayload);
    if (!taskQuality.ok) {
      const normalizedError = createTaskQualityNormalizedError({
        source: "agents.dispatch",
        issues: taskQuality.issues,
      });
      return NextResponse.json(
        {
          msg: "Dispatch blocked by task-quality guardrails.",
          code: normalizedError.code,
          error: normalizedError,
          issues: taskQuality.issues,
          nextStep: "Revise the task payload objective/scope/verification/rollback/output bounds, then retry dispatch.",
        },
        { status: 422 },
      );
    }

    const agent = findAgentById(user.id, project.id, id);
    if (!agent) {
      return notFound("Agent not found.");
    }
    if (agent.status !== "active") {
      return badRequest("Only active agents can be dispatched.");
    }
    if (agent.executor !== "openclaw") {
      return badRequest("This agent is not configured for direct OpenClaw dispatch.");
    }

    const preflight = await validateOpenClawPreflightPaths();
    if (!preflight.ok) {
      return NextResponse.json(
        {
          msg: "Dispatch blocked by runtime preflight.",
          code: "missing_path",
          issues: preflight.issues,
        },
        { status: 503 },
      );
    }

    const evalGuard = await getAgentEvalGuardSnapshot();
    if (evalGuard.promotionStatus !== "ready") {
      createEvalGuardReport({
        userId: user.id,
        projectId: project.id,
        agent: { id: agent.id, name: agent.name, area: agent.area || null, topics: agent.topics },
        guard: evalGuard,
        decision: "blocked",
      });
      console.info("[eval-guard][agents][dispatch] blocked", {
        agentId: agent.id,
        projectId: project.id,
        status: evalGuard.status,
        reasons: evalGuard.reasons,
      });
      return NextResponse.json(
        {
          msg: "Dispatch blocked by eval promotion gate.",
          code: "blocked_by_eval_guardrail",
          status: evalGuard.promotionStatus,
          reason: evalGuard.reasons[0] || "eval_guard_blocked",
          nextStepCommands: evalGuard.nextStepCommands,
          nextStep: `${evalGuard.nextStepCommands.join(" && ")}, then retry dispatch.`,
          evalGuard,
          reasons: evalGuard.reasons,
          artifacts: evalGuard.artifactPaths,
        },
        { status: 409 },
      );
    }

    const evalGuardWarning = evalGuard.status === "degraded" ? "eval_guard_degraded" : null;

    if (evalGuardWarning) {
      createEvalGuardReport({
        userId: user.id,
        projectId: project.id,
        agent: { id: agent.id, name: agent.name, area: agent.area || null, topics: agent.topics },
        guard: evalGuard,
        decision: evalGuard.status === "degraded" ? "degraded" : "unavailable",
      });
    }

    console.info("[eval-guard][agents][dispatch] allow", {
      agentId: agent.id,
      projectId: project.id,
      status: evalGuard.status,
      warning: evalGuardWarning,
      reasons: evalGuard.reasons,
    });

    const projectPath = `${getWorkspaceRootPath().replace(/\\/g, "/")}/${project.relativePath.replace(/\\/g, "/")}`;
    const issueKey = `${agent.id}:${task.slice(0, 120).toLowerCase()}`;
    const lessonHint = await loadLessonHint(projectPath, issueKey, {
      source: "agents.dispatch",
      injectTelemetry: true,
    });

    const preflightPacket = await buildAgentBrief({
      project: { name: project.name, relativePath: project.relativePath },
      agent,
      task,
      deepMode,
      lessonHint,
    });

    const lockKey = `${project.id}:${agent.id}`;
    if (inFlightAgentRuns.has(lockKey)) {
      return NextResponse.json(
        { msg: "Duplicate run guard blocked repeated dispatch.", code: "duplicate_run_guard", costRisk: preflightPacket.costRisk },
        { status: 409 },
      );
    }

    const guard = upsertWorkflowRunSignature({
      userId: user.id,
      projectId: project.id,
      scopeType: "agent",
      scopeId: agent.id,
      runSignature: preflightPacket.runSignature,
      costRiskTier: preflightPacket.costRisk.tier,
      costRiskLabel: preflightPacket.costRisk.label,
    });

    if (guard.duplicateBlocked) {
      return NextResponse.json(
        {
          msg: "Duplicate run guard blocked repeated dispatch.",
          code: "duplicate_run_guard",
          costRisk: preflightPacket.costRisk,
          reanalysisRequired: guard.state?.reanalysisRequired || false,
        },
        { status: 409 },
      );
    }

    const effectiveLessonHint = {
      snippets: lessonHint.snippets,
      ruleSnippets: lessonHint.ruleSnippets,
      reanalysisRequired: lessonHint.reanalysisRequired || Boolean(guard.state?.reanalysisRequired),
    };

    let targetProjectPath: string | undefined;
    let runContext: { runId: string; worktreePath: string; status: string } | null = null;
    if (runId) {
      if (agent.backend !== "agent-orchestrator") {
        return NextResponse.json(
          {
            msg: "runId dispatch targeting is currently available only for agent-orchestrator backend.",
            code: "run_target_unsupported_backend",
            reason: "unsupported_backend",
            nextCommand: "Use an agent-orchestrator agent or omit runId.",
            artifactPath: projectPath,
          },
          { status: 422 },
        );
      }

      const run = findWorkspaceRunById(user.id, project.id, runId);
      if (!run) {
        return NextResponse.json(
          {
            msg: "Workspace run not found.",
            code: "workspace_run_not_found",
            reason: "run_not_found",
            nextCommand: "Create/list runs and retry dispatch with a valid runId.",
            artifactPath: projectPath,
          },
          { status: 404 },
        );
      }

      if (run.status !== "active") {
        return NextResponse.json(
          {
            msg: "Workspace run is not active.",
            code: "workspace_run_inactive",
            reason: "run_not_active",
            nextCommand: "Create a new run or reopen a usable worktree, then retry dispatch.",
            artifactPath: run.worktreePath,
          },
          { status: 409 },
        );
      }

      const worktreeExists = await verifyRunWorktreePath(run.worktreePath);
      if (!worktreeExists) {
        return NextResponse.json(
          {
            msg: "Workspace run worktree path is missing.",
            code: "workspace_run_path_missing",
            reason: "worktree_path_missing",
            nextCommand: "Recreate run worktree or close this run and create a new one.",
            artifactPath: run.worktreePath,
          },
          { status: 409 },
        );
      }

      if (hasRunningWorkspaceRunDispatch(user.id, project.id, run.id) || inFlightRunDispatches.has(run.id)) {
        return NextResponse.json(
          {
            msg: "Dispatch already running for this run.",
            code: "run_dispatch_single_flight",
            reason: "run_dispatch_in_flight",
            nextCommand: "Wait for current run dispatch to finish and retry.",
            artifactPath: run.worktreePath,
          },
          { status: 409 },
        );
      }

      targetProjectPath = run.worktreePath.replace(/\\/g, "/");
      runContext = { runId: run.id, worktreePath: run.worktreePath, status: run.status };
    }

    let runDispatchRecord = runContext
      ? createWorkspaceRunDispatch({
          userId: user.id,
          projectId: project.id,
          runId: runContext.runId,
          agentId: agent.id,
          status: "running",
          metadata: { startedBy: "agents.dispatch", startedAt: new Date().toISOString() },
        })
      : null;

    inFlightAgentRuns.add(lockKey);
    if (runContext) inFlightRunDispatches.add(runContext.runId);
    const { brief, packet, dispatch, aoSessionId, dispatchBody, summary: openClawSummary } = await runAgentDispatch({
      userId: user.id,
      project: { id: project.id, name: project.name, relativePath: project.relativePath },
      agent,
      task,
      deepMode,
      lessonHint: effectiveLessonHint,
      targetProjectPath,
    });
    const handoffResults = shouldAutoRunHandoffs(agent.chainPolicy, dispatch.ok)
      ? await executeHandoffs({
          userId: user.id,
          project: { id: project.id, name: project.name, relativePath: project.relativePath },
          agent,
          task,
          previousSummary: dispatch.ok ? openClawSummary : `Primary dispatch failed with status ${dispatch.status}.`,
        })
      : [];

    if (!dispatch.ok) {
      inFlightAgentRuns.delete(lockKey);
      await appendLessonEvent({
        projectPath,
        runType: "agent",
        issueKey,
        summary: `Dispatch failed (${dispatch.status}) for ${agent.name}`,
        outcome: "failure",
      });
      recordWorkflowRunOutcome({
        userId: user.id,
        projectId: project.id,
        scopeType: "agent",
        scopeId: id,
        outcome: "failure",
      });
      const updatedAgent = recordAgentRun(
        user.id,
        project.id,
        id,
        "error",
        `Dispatch failed (${dispatch.status})`,
      );

      const report = createReport(user.id, project.id, {
        title: `Agent dispatch failed: ${agent.name}`,
        content: `Command: ${dispatch.command}\nBackend: ${agent.backend}\nAgent: ${(dispatch as { agentId?: string }).agentId || "main"}\nSession: ${aoSessionId || "none"}\nStatus: ${dispatch.status}\nChain policy: ${agent.chainPolicy}\nHandoffs: ${handoffResults.length ? handoffResults.map((row) => `${row.name} => ${row.summary}`).join("; ") : "none"}\n\nResponse:\n${dispatchBody || "(empty)"}`,
        category: "error",
        status: "error",
        area: agent.area || "agents",
        source: "Mission Control",
        topics: [...agent.topics, "agents", "openclaw", agent.role],
        metadata: {
          ...buildAgentDispatchMetadata({
            agentId: agent.id,
            openclawAgentId: (dispatch as { agentId?: string }).agentId || null,
            backend: agent.backend,
            sessionId: aoSessionId || null,
            command: dispatch.command,
            args: dispatch.args,
            parsed: (dispatch as { parsed?: Record<string, unknown> | null }).parsed || null,
            handoffs: handoffResults,
            failureClass: (dispatch as { failureClass?: string | null }).failureClass || null,
            attempts: (dispatch as { attempts?: number }).attempts || 1,
            totalDurationMs: (dispatch as { totalDurationMs?: number }).totalDurationMs || 0,
            modelUsed: (dispatch as { modelUsed?: string }).modelUsed || null,
            fallbackUsed: Boolean((dispatch as { fallbackUsed?: boolean }).fallbackUsed),
          }),
          ...buildReliabilityTelemetry({
            endpoint: "/api/agents/[id]/dispatch",
            source: "agents.dispatch",
            success: false,
            failureClass: (dispatch as { failureClass?: string | null }).failureClass || null,
            attempts: (dispatch as { attempts?: number }).attempts || 1,
            totalDurationMs: (dispatch as { totalDurationMs?: number }).totalDurationMs || 0,
            modelUsed: (dispatch as { modelUsed?: string }).modelUsed || null,
            fallbackUsed: Boolean((dispatch as { fallbackUsed?: boolean }).fallbackUsed),
          }),
          lessonTelemetry: lessonHint.telemetry,
          runContext,
        },
      });

      if (runDispatchRecord) {
        runDispatchRecord = updateWorkspaceRunDispatch(user.id, project.id, runDispatchRecord.id, {
          sessionId: aoSessionId || null,
          model: (dispatch as { modelUsed?: string }).modelUsed || null,
          finishedAt: new Date().toISOString(),
          status: "error",
          failureClass: (dispatch as { failureClass?: string | null }).failureClass || "dispatch_error",
          command: dispatch.command,
          reportId: report.id,
          artifactPath: runContext?.worktreePath || null,
          metadata: {
            ...(runDispatchRecord.metadata || {}),
            dispatchStatus: dispatch.status,
            runContext,
          },
        });
      }
      if (runContext) {
        inFlightRunDispatches.delete(runContext.runId);
        const runRow = findWorkspaceRunById(user.id, project.id, runContext.runId);
        if (runRow) {
          updateWorkspaceRun(user.id, project.id, runContext.runId, {
            metadata: {
              ...runRow.metadata,
              lastDispatchAt: new Date().toISOString(),
              lastDispatchStatus: "error",
              lastDispatchReportId: report.id,
            },
          });
        }
      }

      return NextResponse.json(
        {
          msg: "Agent dispatch failed.",
          agent: updatedAgent,
          run: {
            summary: `Dispatch failed with status ${dispatch.status}.`,
            brief,
            reportHref: buildReportHref(report.date),
            reportId: report.id,
            handoffs: handoffResults,
            workflow: packet.workflow,
            costRisk: packet.costRisk,
            deepMode: packet.deepMode,
            evalGuard,
            promotionStatus: evalGuard.promotionStatus,
            evalGuardWarning,
            failureClass: (dispatch as { failureClass?: string | null }).failureClass || null,
            attempts: (dispatch as { attempts?: number }).attempts || 1,
            totalDurationMs: (dispatch as { totalDurationMs?: number }).totalDurationMs || 0,
            modelUsed: (dispatch as { modelUsed?: string }).modelUsed || null,
            fallbackUsed: Boolean((dispatch as { fallbackUsed?: boolean }).fallbackUsed),
            runContext,
          },
        },
        { status: 502 },
      );
    }

    if (agent.backend === "agent-orchestrator" && aoSessionId) {
      updateAgent(user.id, project.id, id, {
        sessionId: aoSessionId,
        backend: "agent-orchestrator",
      });
    }

    const updatedAgent = recordAgentRun(
      user.id,
      project.id,
      id,
      agent.backend === "agent-orchestrator" ? "running" : "dispatched",
      openClawSummary,
    );

    const report = createReport(user.id, project.id, {
      title: `Agent dispatched: ${agent.name}`,
      content: `Command: ${dispatch.command}\nBackend: ${agent.backend}\nAgent: ${(dispatch as { agentId?: string }).agentId || "main"}\nSession: ${aoSessionId || "none"}\nStatus: ${dispatch.status}\nChain policy: ${agent.chainPolicy}\nSummary: ${openClawSummary}\nHandoffs: ${handoffResults.length ? handoffResults.map((row) => `${row.name} => ${row.summary}`).join('; ') : 'none'}\n\nTask:\n${task}\n\nResponse:\n${dispatchBody || "(empty)"}`,
      category: "task",
      status: "info",
      area: agent.area || "agents",
      source: "Mission Control",
      topics: [...agent.topics, "agents", "openclaw", agent.role],
      metadata: {
        ...buildAgentDispatchMetadata({
          agentId: agent.id,
          openclawAgentId: (dispatch as { agentId?: string }).agentId || null,
          backend: agent.backend,
          sessionId: aoSessionId || null,
          command: dispatch.command,
          args: dispatch.args,
          parsed: (dispatch as { parsed?: Record<string, unknown> | null }).parsed || null,
          handoffs: handoffResults,
          failureClass: (dispatch as { failureClass?: string | null }).failureClass || null,
          attempts: (dispatch as { attempts?: number }).attempts || 1,
          totalDurationMs: (dispatch as { totalDurationMs?: number }).totalDurationMs || 0,
          modelUsed: (dispatch as { modelUsed?: string }).modelUsed || null,
          fallbackUsed: Boolean((dispatch as { fallbackUsed?: boolean }).fallbackUsed),
        }),
        ...buildReliabilityTelemetry({
          endpoint: "/api/agents/[id]/dispatch",
          source: "agents.dispatch",
          success: true,
          failureClass: (dispatch as { failureClass?: string | null }).failureClass || null,
          attempts: (dispatch as { attempts?: number }).attempts || 1,
          totalDurationMs: (dispatch as { totalDurationMs?: number }).totalDurationMs || 0,
          modelUsed: (dispatch as { modelUsed?: string }).modelUsed || null,
          fallbackUsed: Boolean((dispatch as { fallbackUsed?: boolean }).fallbackUsed),
          }),
          lessonTelemetry: lessonHint.telemetry,
          runContext,
        },
      });

    if (runDispatchRecord) {
      runDispatchRecord = updateWorkspaceRunDispatch(user.id, project.id, runDispatchRecord.id, {
        sessionId: aoSessionId || null,
        model: (dispatch as { modelUsed?: string }).modelUsed || null,
        finishedAt: new Date().toISOString(),
        status: "success",
        failureClass: null,
        command: dispatch.command,
        reportId: report.id,
        artifactPath: runContext?.worktreePath || null,
        metadata: {
          ...(runDispatchRecord.metadata || {}),
          dispatchStatus: dispatch.status,
          runContext,
        },
      });
    }
    if (runContext) {
      inFlightRunDispatches.delete(runContext.runId);
      const runRow = findWorkspaceRunById(user.id, project.id, runContext.runId);
      if (runRow) {
        updateWorkspaceRun(user.id, project.id, runContext.runId, {
          metadata: {
            ...runRow.metadata,
            lastDispatchAt: new Date().toISOString(),
            lastDispatchStatus: "success",
            lastDispatchReportId: report.id,
          },
        });
      }
    }

    inFlightAgentRuns.delete(lockKey);
    await appendLessonEvent({
      projectPath,
      runType: "agent",
      issueKey,
      summary: `Dispatched ${agent.name} (${packet.costRisk.label})`,
      outcome: "success",
    });
    recordWorkflowRunOutcome({
      userId: user.id,
      projectId: project.id,
      scopeType: "agent",
      scopeId: id,
      outcome: "success",
    });

    return NextResponse.json({
      msg: "Agent dispatched.",
      agent: updatedAgent,
      run: {
        summary: `Task dispatched.${openClawSummary ? ` Result: ${openClawSummary}` : ""}${handoffResults.length ? ` Handoffs: ${handoffResults.map((row) => row.name).join(', ')}` : ""}`,
        brief,
        reportHref: buildReportHref(report.date),
        reportId: report.id,
        handoffs: handoffResults,
        workflow: packet.workflow,
        costRisk: packet.costRisk,
        deepMode: packet.deepMode,
        evalGuard,
        promotionStatus: evalGuard.promotionStatus,
        evalGuardWarning,
        failureClass: (dispatch as { failureClass?: string | null }).failureClass || null,
        attempts: (dispatch as { attempts?: number }).attempts || 1,
        totalDurationMs: (dispatch as { totalDurationMs?: number }).totalDurationMs || 0,
        modelUsed: (dispatch as { modelUsed?: string }).modelUsed || null,
        fallbackUsed: Boolean((dispatch as { fallbackUsed?: boolean }).fallbackUsed),
        lessonTelemetry: lessonHint.telemetry,
        runContext,
      },
    });
  } catch (error) {
    return serverError(error, "Dispatch agent error", "Failed to dispatch agent.");
  }
}
