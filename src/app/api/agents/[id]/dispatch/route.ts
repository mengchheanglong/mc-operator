import { readFile, readdir } from "fs/promises";
import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { getWorkspaceRootPath } from "@/server/projects/workspace-projects";
import { findAgentById, recordAgentRun, updateAgent } from "@/server/repositories/agents-repo";
import type { AgentDefinition } from "@/types/agents";
import { createReport } from "@/server/repositories/reports-repo";
import { dispatchToOpenClawAgent } from "@/server/services/openclaw-delivery-service";
import { spawnAgentOrchestratorRun } from "@/server/services/agent-orchestrator-service";
import type { AgentChainPolicy } from "@/types/agents";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_STORED_DISPATCH_BODY = 12000;

type HandoffResult = {
  agentId: string;
  name: string;
  ok: boolean;
  summary: string;
  sessionId: string | null;
};

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
    packAssets: Array<{ label: string; path: string; kind: string }>;
    handoffAgentIds: string[];
    sourcePack: string;
    sourceRef: string | null;
  };
  task: string;
}) {
  const topics = input.agent.topics.length > 0 ? input.agent.topics.join(", ") : "none";

  const workflow = input.agent.workflowProfile;
  const objectives = workflow.objectives.length ? workflow.objectives.join("; ") : "none";
  const constraints = workflow.constraints.length ? workflow.constraints.join("; ") : "none";
  const deliverables = workflow.deliverables.length ? workflow.deliverables.join("; ") : "none";
  const packAssets = input.agent.packAssets.length
    ? input.agent.packAssets.map((asset) => `${asset.kind}: ${asset.label} -> ${asset.path}`).join("\n")
    : "none";
  const packSnippets = await buildPackSnippets(input.agent.packAssets);
  const handoffChain = input.agent.handoffAgentIds.length ? input.agent.handoffAgentIds.join(", ") : "none";

  return [
    `Project: ${input.project.name} (${input.project.relativePath})`,
    `Agent: ${input.agent.name}`,
    `Role: ${input.agent.role}`,
    `Area: ${input.agent.area || "none"}`,
    `Topics: ${topics}`,
    `Source pack: ${input.agent.sourcePack}`,
    `Source ref: ${input.agent.sourceRef || "none"}`,
    `Workflow mode: ${workflow.mode}`,
    `Workflow objectives: ${objectives}`,
    `Workflow constraints: ${constraints}`,
    `Workflow deliverables: ${deliverables}`,
    `Pack assets:\n${packAssets}`,
    packSnippets ? `Pack snippets:\n${packSnippets}` : null,
    `Handoff chain: ${handoffChain}`,
    input.agent.description ? `Description: ${input.agent.description}` : null,
    "",
    "System prompt",
    input.agent.systemPrompt.trim() || "No explicit system prompt provided.",
    "",
    "Task",
    input.task.trim(),
    "",
    "Interaction rule",
    "Immediately send this exact acknowledgment before doing the main work: 'Received from Mission Control — starting now.'",
    "Then continue with the task and send progress updates for longer work.",
    "",
    "Runtime guardrails",
    "Do not leave background processes, dev servers, watchers, or indexing jobs running after the task completes unless the user explicitly asked for a long-running process.",
    "Prefer bounded checks and short-lived commands.",
    "Do not start repo-wide indexing or heavy background analysis unless explicitly requested.",
    "If a background process is truly required, report the exact command, PID, and cleanup step before finishing.",
    "",
    "Output",
    "Return the work result, changed files if any, verification performed, and any follow-up needed.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function runAgentDispatch(input: {
  userId: string;
  project: { id: string; name: string; relativePath: string };
  agent: AgentDefinition;
  task: string;
}) {
  const brief = await buildAgentBrief({
    project: { name: input.project.name, relativePath: input.project.relativePath },
    agent: input.agent,
    task: input.task,
  });

  const projectPath = `${getWorkspaceRootPath().replace(/\\/g, "/")}/${input.project.relativePath.replace(/\\/g, "/")}`;
  const dispatch = input.agent.backend === "agent-orchestrator"
    ? await spawnAgentOrchestratorRun(projectPath, brief)
    : await dispatchToOpenClawAgent({
        brief,
        timeoutSeconds: 180,
        thinking: "medium",
      });

  const aoSessionId = "sessionId" in dispatch ? dispatch.sessionId : null;
  const dispatchBody = truncateDispatchBody(dispatch.body || "");
  const summary = input.agent.backend === "agent-orchestrator"
    ? `AO session started${aoSessionId ? ` (${aoSessionId})` : ""}.`
    : extractOpenClawSummary((dispatch as { parsed?: Record<string, unknown> | null }).parsed || null, "Task sent to OpenClaw.");

  return { brief, dispatch, aoSessionId, dispatchBody, summary };
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

    if (!id) {
      return badRequest("Agent ID is required.");
    }
    if (!task) {
      return badRequest("Task is required.");
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

    const { brief, dispatch, aoSessionId, dispatchBody, summary: openClawSummary } = await runAgentDispatch({
      userId: user.id,
      project: { id: project.id, name: project.name, relativePath: project.relativePath },
      agent,
      task,
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
          agentId: agent.id,
          openclawAgentId: (dispatch as { agentId?: string }).agentId || null,
          backend: agent.backend,
          sessionId: aoSessionId || null,
          command: dispatch.command,
          args: dispatch.args,
          parsed: (dispatch as { parsed?: Record<string, unknown> | null }).parsed || null,
          handoffs: handoffResults,
        },
      });

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
        agentId: agent.id,
        openclawAgentId: (dispatch as { agentId?: string }).agentId || null,
        backend: agent.backend,
        sessionId: aoSessionId || null,
        command: dispatch.command,
        args: dispatch.args,
        parsed: (dispatch as { parsed?: Record<string, unknown> | null }).parsed || null,
        handoffs: handoffResults,
      },
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
      },
    });
  } catch (error) {
    return serverError(error, "Dispatch agent error", "Failed to dispatch agent.");
  }
}
