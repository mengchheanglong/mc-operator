import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import {
  findAutomationTemplateById,
  recordAutomationTemplateRun,
} from "@/server/repositories/automation-templates-repo";
import {
  createTemplateRun,
  updateTemplateRun,
} from "@/server/repositories/automation-template-runs-repo";
import { createReport } from "@/server/repositories/reports-repo";
import { dispatchToN8n } from "@/server/services/automation-executor-service";
import {
  dispatchToOpenClawAgent,
  validateOpenClawPreflightPaths,
} from "@/server/services/openclaw-delivery-service";
import { buildExecutionPacket } from "@/lib/workflow/mission-control-workflow";
import { appendLessonEvent, loadLessonHint } from "@/server/services/workflow-lessons-service";
import { getWorkspaceRootPath } from "@/server/projects/workspace-projects";
import { recordWorkflowRunOutcome, upsertWorkflowRunSignature } from "@/server/repositories/workflow-run-guards-repo";
import { getAgentEvalGuardSnapshot, type AgentEvalGuardSnapshot } from "@/server/services/agent-eval-guard-service";
import {
  buildTaskQualityPayload,
  createTaskQualityNormalizedError,
  validateTaskQualityPayload,
} from "@/server/services/task-quality-guardrails";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const inFlightTemplateRuns = new Set<string>();
const MAX_STORED_DISPATCH_BODY = 12000;

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

function normalizeUrl(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return normalized.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, pathname: string) {
  return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function buildExecutionBrief(input: {
  project: { name: string; relativePath: string };
  template: {
    name: string;
    prompt: string;
    executor: string;
    executionEnv: string;
    area: string | null;
    topics: string[];
    webhookPath: string | null;
  };
  deepMode?: boolean;
  lessonSnippets?: string[];
  lessonRuleSnippets?: string[];
}) {
  const packet = buildExecutionPacket({
    objective: input.template.prompt.trim(),
    constraints: [
      `Executor: ${input.template.executor}`,
      `Environment: ${input.template.executionEnv}`,
      "Follow workflow objective -> constraints -> execution -> verification -> report.",
    ],
    executionNotes: [
      "Immediately send: 'Received from Mission Control — starting now.'",
      "Keep scope bounded to one automation task.",
    ],
    verification: ["Verification is required before completion."],
    reportFormat: ["Changed files", "Verification output", "Follow-up action"],
    contextBlocks: [
      { label: "project", content: `Project: ${input.project.name} (${input.project.relativePath})` },
      { label: "template", content: `Template: ${input.template.name}\nArea: ${input.template.area || "none"}\nTopics: ${input.template.topics.join(", ") || "none"}` },
      { label: "lessons", content: input.lessonSnippets?.join("\n") || "none" },
      { label: "lesson-rules", content: input.lessonRuleSnippets?.join("\n") || "none" },
    ],
    deepMode: input.deepMode,
  });

  return packet;
}

function buildExecutorPayload(input: {
  project: { id: string; name: string; relativePath: string };
  template: {
    id: string;
    name: string;
    prompt: string;
    executor: string;
    executionEnv: string;
    area: string | null;
    topics: string[];
    webhookPath?: string | null;
  };
  idempotencyKey: string;
  workflow?: string[];
  costRisk?: { tier: string; label: string; score: number };
}) {
  return {
    projectId: input.project.id,
    projectName: input.project.name,
    projectPath: input.project.relativePath,
    templateId: input.template.id,
    templateName: input.template.name,
    executor: input.template.executor,
    executionEnv: input.template.executionEnv,
    area: input.template.area,
    topics: input.template.topics,
    webhookPath: input.template.webhookPath || null,
    prompt: input.template.prompt.trim(),
    generatedTaskBrief: input.template.prompt.trim(),
    idempotencyKey: input.idempotencyKey,
    workflow: input.workflow || ["objective", "constraints", "execution", "verification", "report"],
    costRisk: input.costRisk || null,
    dispatchedAt: new Date().toISOString(),
  };
}

function buildIdempotencyKey(input: {
  projectId: string;
  templateId: string;
  prompt: string;
  topics: string[];
}) {
  const minuteBucket = new Date().toISOString().slice(0, 16);
  return createHash("sha256")
    .update(
      [
        input.projectId,
        input.templateId,
        input.prompt.trim(),
        input.topics.join(","),
        minuteBucket,
      ].join("|"),
    )
    .digest("hex");
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

function createEvalGuardReport(input: {
  userId: string;
  projectId: string;
  template: { id: string; name: string; area: string | null; topics: string[] };
  guard: AgentEvalGuardSnapshot;
  decision: "blocked" | "degraded" | "unavailable";
}) {
  return createReport(input.userId, input.projectId, {
    title: `Eval guard ${input.decision}: ${input.template.name}`,
    content: `Status: ${input.guard.status}\nScore: ${input.guard.metrics.score}\nFailure rate: ${input.guard.metrics.failureRate}\nCost USD: ${input.guard.metrics.costUsd}\nArtifact: ${input.guard.artifactPath}\nTimestamp: ${input.guard.timestamp || "none"}\nReasons: ${input.guard.reasons.join(", ") || "none"}`,
    category: input.decision === "blocked" ? "error" : "maintenance",
    status: input.decision === "blocked" ? "error" : "warning",
    area: "automation",
    source: "Mission Control",
    topics: [...input.template.topics, "automation", "eval-guard"],
    metadata: {
      templateId: input.template.id,
      evalGuard: input.guard,
      decision: input.decision,
      topic: "eval-guard",
    },
  });
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) return badRequest("Template ID is required.");
    if (inFlightTemplateRuns.has(id)) {
      return NextResponse.json(
        { msg: "Template execution already in flight.", code: "single_flight_lock" },
        { status: 409 },
      );
    }

    const template = findAutomationTemplateById(user.id, project.id, id);
    if (!template) return notFound("Automation template not found.");
    const body = await req.json().catch(() => ({}));
    const deepMode = Boolean((body as { deepMode?: unknown }).deepMode);

    const taskQualityPayload = buildTaskQualityPayload({
      objective: template.prompt,
      scope: `Automation execute scoped to template ${template.id} (${template.executor}) in current project context only.`,
      verificationSteps: [
        "Run execution-relevant verification and include status/body evidence in the run report.",
      ],
      rollbackPlan: [
        "If dispatch fails or risks regression, stop and fall back to reporting actionable failure context.",
      ],
      outputExpectation: [
        "Return bounded execute output only: dispatch status, summary, and key metadata (no more than one response payload).",
      ],
    });
    const taskQuality = validateTaskQualityPayload(taskQualityPayload);
    if (!taskQuality.ok) {
      const normalizedError = createTaskQualityNormalizedError({
        source: "automation.templates.execute",
        issues: taskQuality.issues,
      });
      return NextResponse.json(
        {
          msg: "Execution blocked by task-quality guardrails.",
          code: normalizedError.code,
          error: normalizedError,
          issues: taskQuality.issues,
          nextStep: "Revise the template task payload objective/scope/verification/rollback/output bounds, then retry execution.",
        },
        { status: 422 },
      );
    }

    const preflight = await validateOpenClawPreflightPaths();
    if (!preflight.ok) {
      return NextResponse.json(
        {
          msg: "Execution blocked by runtime preflight.",
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
        template: { id: template.id, name: template.name, area: template.area || null, topics: template.topics },
        guard: evalGuard,
        decision: "blocked",
      });
      console.info("[eval-guard][automation][execute] blocked", {
        templateId: template.id,
        projectId: project.id,
        status: evalGuard.status,
        reasons: evalGuard.reasons,
      });
      return NextResponse.json(
        {
          msg: "Execution blocked by eval promotion gate.",
          code: "blocked_by_eval_guardrail",
          status: evalGuard.promotionStatus,
          reason: evalGuard.reasons[0] || "eval_guard_blocked",
          nextStepCommands: evalGuard.nextStepCommands,
          nextStep: `${evalGuard.nextStepCommands.join(" && ")}, then retry execution.`,
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
        template: { id: template.id, name: template.name, area: template.area || null, topics: template.topics },
        guard: evalGuard,
        decision: evalGuard.status === "degraded" ? "degraded" : "unavailable",
      });
    }

    console.info("[eval-guard][automation][execute] allow", {
      templateId: template.id,
      projectId: project.id,
      status: evalGuard.status,
      warning: evalGuardWarning,
      reasons: evalGuard.reasons,
    });

    const webhookPath = String(template.webhookPath || "").trim();
    const n8nBaseUrl = normalizeUrl(process.env.N8N_BASE_URL);

    if (template.executor === "n8n") {
      if (!webhookPath) return badRequest("Template webhook path is required for n8n execute.");
      if (!n8nBaseUrl) return badRequest("N8N_BASE_URL is not configured.");
    }

    const idempotencyKey = buildIdempotencyKey({
      projectId: project.id,
      templateId: template.id,
      prompt: template.prompt,
      topics: template.topics,
    });

    const projectPath = `${getWorkspaceRootPath().replace(/\\/g, "/")}/${project.relativePath.replace(/\\/g, "/")}`;
    const issueKey = `${template.id}:${template.prompt.trim().toLowerCase().slice(0, 120)}`;
    const lessonHint = await loadLessonHint(projectPath, issueKey, {
      source: "automation.templates.execute",
      injectTelemetry: true,
    });

    const packet = buildExecutionBrief({
      project: { name: project.name, relativePath: project.relativePath },
      template,
      deepMode,
      lessonSnippets: lessonHint.snippets,
      lessonRuleSnippets: lessonHint.ruleSnippets,
    });

    const guard = upsertWorkflowRunSignature({
      userId: user.id,
      projectId: project.id,
      scopeType: "automation",
      scopeId: template.id,
      runSignature: packet.runSignature,
      costRiskTier: packet.costRisk.tier,
      costRiskLabel: packet.costRisk.label,
    });

    if (guard.duplicateBlocked) {
      return NextResponse.json(
        {
          msg: "Duplicate run guard blocked repeated automation execute.",
          code: "duplicate_run_guard",
          costRisk: packet.costRisk,
          reanalysisRequired: guard.state?.reanalysisRequired || false,
        },
        { status: 409 },
      );
    }

    const brief = `${packet.brief}\n\nCost risk: ${packet.costRisk.label}`;

    const executorPayload = buildExecutorPayload({
      project: { id: project.id, name: project.name, relativePath: project.relativePath },
      template,
      idempotencyKey,
      workflow: packet.workflow,
      costRisk: packet.costRisk,
    });

    const targetUrl =
      template.executor === "n8n"
        ? joinUrl(n8nBaseUrl as string, webhookPath)
        : "openclaw agent";

    const run = createTemplateRun({
      userId: user.id,
      projectId: project.id,
      templateId: template.id,
      mode: "execute",
      status: "queued",
      summary: "Execution dispatch queued.",
      idempotencyKey,
      targetUrl,
      request: executorPayload,
    });

    inFlightTemplateRuns.add(id);
    let dispatch:
      | ({
          ok: boolean;
          status: number;
          body: string;
          command?: string;
          args?: string[];
          parsed?: Record<string, unknown> | null;
          agentId?: string;
          failureClass?: string | null;
          attempts?: number;
          totalDurationMs?: number;
          modelUsed?: string | null;
          fallbackUsed?: boolean;
        } & { queuePath?: string; packetId?: string });
    try {
      if (template.executor === "n8n") {
        dispatch = await dispatchToN8n({
          targetUrl,
          payload: executorPayload,
          idempotencyKey,
          timeoutMs: 12000,
        });
      } else if (template.executor === "openclaw") {
        dispatch = await dispatchToOpenClawAgent({
          brief,
          timeoutSeconds: 180,
          thinking: "medium",
        });
      } else {
        dispatch = {
          ok: false,
          status: 400,
          body: `Executor '${template.executor}' is not enabled for direct execute yet. Use openclaw or n8n executor, or Generate Task.`,
        };
      }
    } finally {
      inFlightTemplateRuns.delete(id);
    }

    const dispatchBody = truncateDispatchBody(dispatch.body || "");

    if (!dispatch.ok) {
      updateTemplateRun(user.id, project.id, run.id, {
        status: "error",
        summary: `Dispatch failed (${dispatch.status})`,
        response: {
          status: dispatch.status,
          body: dispatchBody,
          command: dispatch.command || null,
          args: dispatch.args || null,
          parsed: dispatch.parsed || null,
          failureClass: dispatch.failureClass || null,
          attempts: dispatch.attempts || 1,
          totalDurationMs: dispatch.totalDurationMs || 0,
          modelUsed: dispatch.modelUsed || null,
          fallbackUsed: Boolean(dispatch.fallbackUsed),
        },
        errorMessage: dispatchBody || `Dispatch failed (${dispatch.status})`,
      });

      recordWorkflowRunOutcome({
        userId: user.id,
        projectId: project.id,
        scopeType: "automation",
        scopeId: id,
        outcome: "failure",
      });
      const failedTemplate = recordAutomationTemplateRun(
        user.id,
        project.id,
        id,
        "error",
        `Dispatch failed (${dispatch.status})`,
      );

      const report = createReport(user.id, project.id, {
        title: `Automation dispatch failed: ${template.name}`,
        content:
          template.executor === "openclaw"
            ? `Command: ${dispatch.command || targetUrl}\nStatus: ${dispatch.status}\nIdempotency: ${idempotencyKey}\n\nResponse:\n${dispatchBody || "(empty)"}`
            : `Target: ${targetUrl}\nStatus: ${dispatch.status}\nIdempotency: ${idempotencyKey}\n\nResponse:\n${dispatchBody || "(empty)"}`,
        category: "maintenance",
        status: "error",
        area: template.area || "automation",
        source: "Mission Control",
        topics: [...template.topics, "automation", "dispatch"],
        metadata: {
          templateId: template.id,
          webhookPath,
          command: dispatch.command || null,
          agentId: dispatch.agentId || null,
          idempotencyKey,
          dispatchStatus: dispatch.status,
          failureClass: dispatch.failureClass || null,
          totalDurationMs: dispatch.totalDurationMs || 0,
          modelUsed: dispatch.modelUsed || null,
          fallbackUsed: Boolean(dispatch.fallbackUsed),
          lessonTelemetry: lessonHint.telemetry,
          ...buildReliabilityTelemetry({
            endpoint: "/api/automation/templates/[id]/execute",
            source: "automation.templates.execute",
            success: false,
            failureClass: dispatch.failureClass || null,
            attempts: dispatch.attempts || 1,
            totalDurationMs: dispatch.totalDurationMs || 0,
            modelUsed: dispatch.modelUsed || null,
            fallbackUsed: Boolean(dispatch.fallbackUsed),
          }),
        },
      });

      await appendLessonEvent({
        projectPath,
        runType: "automation",
        issueKey,
        summary: `Dispatch failed (${dispatch.status}) for ${template.name}`,
        outcome: "failure",
      });

      return NextResponse.json(
        {
          msg: "Automation dispatch failed.",
          template: failedTemplate,
          run: {
            summary: `Dispatch failed with status ${dispatch.status}.`,
            brief,
            executorPayload,
            reportHref: buildReportHref(report.date),
            reportId: report.id,
            workflow: packet.workflow,
            costRisk: packet.costRisk,
            evalGuard,
            promotionStatus: evalGuard.promotionStatus,
            evalGuardWarning,
            failureClass: dispatch.failureClass || null,
            attempts: dispatch.attempts || 1,
            totalDurationMs: dispatch.totalDurationMs || 0,
            modelUsed: dispatch.modelUsed || null,
            fallbackUsed: Boolean(dispatch.fallbackUsed),
          },
        },
        { status: 502 },
      );
    }

    const openClawSummary =
      template.executor === "openclaw"
        ? extractOpenClawSummary(dispatch.parsed || null, "Task sent to OpenClaw.")
        : null;

    updateTemplateRun(user.id, project.id, run.id, {
      status: "dispatched",
      summary:
        template.executor === "openclaw"
          ? openClawSummary || "Task sent to OpenClaw."
          : "Execution dispatched to n8n.",
      response: {
        status: dispatch.status,
        body: dispatchBody,
        command: dispatch.command || null,
        args: dispatch.args || null,
        parsed: dispatch.parsed || null,
        failureClass: dispatch.failureClass || null,
        attempts: dispatch.attempts || 1,
        totalDurationMs: dispatch.totalDurationMs || 0,
        modelUsed: dispatch.modelUsed || null,
        fallbackUsed: Boolean(dispatch.fallbackUsed),
      },
    });

    const updatedTemplate = recordAutomationTemplateRun(
      user.id,
      project.id,
      id,
      "dispatched",
      template.executor === "openclaw"
        ? openClawSummary || "Task sent to OpenClaw."
        : "Execution dispatched to n8n.",
    );

    const report = createReport(user.id, project.id, {
      title:
        template.executor === "openclaw"
          ? `Automation sent to OpenClaw: ${template.name}`
          : `Automation dispatched: ${template.name}`,
      content:
        template.executor === "openclaw"
          ? `Command: ${dispatch.command || targetUrl}\nAgent: ${dispatch.agentId || "main"}\nIdempotency: ${idempotencyKey}\nStatus: ${dispatch.status}\nSummary: ${openClawSummary || "(none)"}\n\nResponse:\n${dispatchBody || "(empty)"}`
          : `Webhook: ${targetUrl}\nIdempotency: ${idempotencyKey}\nStatus: ${dispatch.status}\n\nResponse:\n${dispatchBody || "(empty)"}`,
      category: "task",
      status: "info",
      area: template.area || "automation",
      source: "Mission Control",
      topics: [
        ...template.topics,
        "automation",
        "dispatch",
        ...(template.executor === "openclaw" ? ["openclaw"] : ["n8n"]),
      ],
      metadata: {
        templateId: template.id,
        webhookPath: webhookPath || null,
        command: dispatch.command || null,
        agentId: dispatch.agentId || null,
        openclawSummary: openClawSummary || null,
        idempotencyKey,
        dispatchStatus: dispatch.status,
        failureClass: dispatch.failureClass || null,
        totalDurationMs: dispatch.totalDurationMs || 0,
        modelUsed: dispatch.modelUsed || null,
        fallbackUsed: Boolean(dispatch.fallbackUsed),
        lessonTelemetry: lessonHint.telemetry,
        ...buildReliabilityTelemetry({
          endpoint: "/api/automation/templates/[id]/execute",
          source: "automation.templates.execute",
          success: true,
          failureClass: dispatch.failureClass || null,
          attempts: dispatch.attempts || 1,
          totalDurationMs: dispatch.totalDurationMs || 0,
          modelUsed: dispatch.modelUsed || null,
          fallbackUsed: Boolean(dispatch.fallbackUsed),
        }),
      },
    });

    await appendLessonEvent({
      projectPath,
      runType: "automation",
      issueKey,
      summary: `Dispatched ${template.name} (${packet.costRisk.label})`,
      outcome: "success",
    });
    recordWorkflowRunOutcome({
      userId: user.id,
      projectId: project.id,
      scopeType: "automation",
      scopeId: id,
      outcome: "success",
    });

    return NextResponse.json({
      msg: template.executor === "openclaw" ? "Automation sent to OpenClaw." : "Automation dispatched.",
      template: updatedTemplate,
      run: {
        summary:
          template.executor === "openclaw"
            ? `Task sent to OpenClaw.${openClawSummary ? ` Result: ${openClawSummary}` : ""}`
            : "Execution dispatched to n8n. Completion is tracked by downstream workflow/reporting.",
        brief,
        executorPayload,
        reportHref: buildReportHref(report.date),
        reportId: report.id,
        workflow: packet.workflow,
        costRisk: packet.costRisk,
        evalGuard,
        promotionStatus: evalGuard.promotionStatus,
        evalGuardWarning,
        failureClass: dispatch.failureClass || null,
        attempts: dispatch.attempts || 1,
        totalDurationMs: dispatch.totalDurationMs || 0,
        modelUsed: dispatch.modelUsed || null,
        fallbackUsed: Boolean(dispatch.fallbackUsed),
        lessonTelemetry: lessonHint.telemetry,
      },
    });
  } catch (error) {
    return serverError(error, "Execute automation template error", "Failed to execute automation template.");
  }
}
