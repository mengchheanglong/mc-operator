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
} from "@/server/services/openclaw-delivery-service";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const inFlightTemplateRuns = new Set<string>();
const MAX_STORED_DISPATCH_BODY = 12000;

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
}) {
  const area = input.template.area || "none";
  const topics = input.template.topics.length > 0 ? input.template.topics.join(", ") : "none";
  const webhookPath = input.template.webhookPath || "none";

  const lines = [
    `Use this automation task for ${input.project.name}.`,
    "",
    "Task",
    input.template.prompt.trim(),
    "",
    "Context",
    `Project: ${input.project.name} (${input.project.relativePath})`,
    `Template: ${input.template.name}`,
    `Area: ${area}`,
    `Topics: ${topics}`,
    `Environment: ${input.template.executionEnv}`,
    "",
    "Interaction rule",
    "Immediately send this exact acknowledgment before doing the main work: 'Received from Mission Control — starting now.'",
    "Then continue with the task and send progress updates for longer work.",
    "",
    "Output",
    "Do the work or prepare the best next action, then summarize changed files, verification, and follow-up.",
    "",
    `Automation template: ${input.template.name}`,
    `Project: ${input.project.name}`,
    `Project path: ${input.project.relativePath}`,
    `Executor: ${input.template.executor}`,
    `Environment: ${input.template.executionEnv}`,
    `Area: ${area}`,
    `Topics: ${topics}`,
    `Webhook path: ${webhookPath}`,
    "",
    "Generated task brief",
    input.template.prompt.trim(),
    "",
    "Intended model",
    "- Mission Control = generate the task cleanly",
    "- OpenClaw = do the task",
    "- n8n = optional delivery/orchestration layer",
  ];

  return lines.join("\n");
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

    const brief = buildExecutionBrief({
      project: { name: project.name, relativePath: project.relativePath },
      template,
    });

    const executorPayload = buildExecutorPayload({
      project: { id: project.id, name: project.name, relativePath: project.relativePath },
      template,
      idempotencyKey,
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
        },
        errorMessage: dispatchBody || `Dispatch failed (${dispatch.status})`,
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
        },
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
      },
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
      },
    });
  } catch (error) {
    return serverError(error, "Execute automation template error", "Failed to execute automation template.");
  }
}
