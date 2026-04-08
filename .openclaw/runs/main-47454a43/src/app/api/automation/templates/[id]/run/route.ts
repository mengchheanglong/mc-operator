import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import {
  findAutomationTemplateById,
  recordAutomationTemplateRun,
} from "@/server/repositories/automation-templates-repo";
import { createReport } from "@/server/repositories/reports-repo";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function buildReportHref(date: string) {
  const day = date.slice(0, 10);
  return day ? `/dashboard/report?day=${encodeURIComponent(day)}` : "/dashboard/report";
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
  };
}) {
  const lines = [
    `Automation Template: ${input.template.name}`,
    `Project: ${input.project.name} (${input.project.relativePath})`,
    `Executor: ${input.template.executor}`,
    `Environment: ${input.template.executionEnv}`,
  ];

  if (input.template.area) {
    lines.push(`Area: ${input.template.area}`);
  }

  if (input.template.topics.length > 0) {
    lines.push(`Topics: ${input.template.topics.join(", ")}`);
  }

  lines.push("");
  lines.push("Task");
  lines.push(input.template.prompt.trim());
  lines.push("");
  lines.push("Expected output");
  lines.push("- make the change or prepare the execution payload");
  lines.push("- log the outcome in Mission Control Reports");
  lines.push("- create or update a Quest if follow-up work is needed");

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
  };
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
    prompt: input.template.prompt.trim(),
  };
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) {
      return badRequest("Template ID is required.");
    }

    const template = findAutomationTemplateById(user.id, project.id, id);
    if (!template) {
      return notFound("Automation template not found.");
    }

    const brief = buildExecutionBrief({
      project: {
        name: project.name,
        relativePath: project.relativePath,
      },
      template,
    });
    const executorPayload = buildExecutorPayload({
      project: {
        id: project.id,
        name: project.name,
        relativePath: project.relativePath,
      },
      template,
    });

    const runSummary =
      template.executor === "n8n"
        ? "Execution brief prepared for n8n handoff."
        : `Execution brief prepared for ${template.executor}.`;

    const updatedTemplate = recordAutomationTemplateRun(
      user.id,
      project.id,
      id,
      "ready",
      runSummary,
    );

    const report = createReport(user.id, project.id, {
      title: `Automation run prepared: ${template.name}`,
      content: brief,
      category: "task",
      status: "info",
      area: template.area || "automation",
      source: "Mission Control",
      topics: [...template.topics, "automation"],
      metadata: {
        executor: template.executor,
        executionEnv: template.executionEnv,
        templateId: template.id,
      },
    });

    return NextResponse.json({
      msg: "Automation run prepared.",
      template: updatedTemplate,
      run: {
        summary: runSummary,
        brief,
        executorPayload,
        reportHref: buildReportHref(report.date),
        reportId: report.id,
      },
    });
  } catch (error) {
    return serverError(error, "Run automation template error", "Failed to prepare automation run.");
  }
}
