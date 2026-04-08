import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import {
  findAutomationTemplateById,
  recordAutomationTemplateRun,
} from "@/server/repositories/automation-templates-repo";
import { createTemplateRun } from "@/server/repositories/automation-template-runs-repo";
import { evaluateAutomationTemplate } from "@/server/services/automation-template-evaluator";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) return badRequest("Template ID is required.");

    const template = findAutomationTemplateById(user.id, project.id, id);
    if (!template) return notFound("Automation template not found.");

    const evaluation = evaluateAutomationTemplate({
      name: template.name,
      prompt: template.prompt,
      executor: template.executor,
      executionEnv: template.executionEnv,
      area: template.area,
      webhookPath: template.webhookPath,
      topics: template.topics,
    });

    createTemplateRun({
      userId: user.id,
      projectId: project.id,
      templateId: template.id,
      mode: "evaluate",
      status: evaluation.recommendedStatus,
      summary: evaluation.summary,
      request: {
        templateId: template.id,
        templateName: template.name,
        executor: template.executor,
        executionEnv: template.executionEnv,
      },
      response: {
        score: evaluation.score,
        summary: evaluation.summary,
        recommendedStatus: evaluation.recommendedStatus,
        findings: evaluation.findings,
      },
    });

    const updatedTemplate = recordAutomationTemplateRun(
      user.id,
      project.id,
      template.id,
      evaluation.recommendedStatus,
      evaluation.summary,
    );

    return NextResponse.json({
      msg: "Template check completed.",
      template: updatedTemplate,
      evaluation,
    });
  } catch (error) {
    return serverError(error, "Automation template check error", "Failed to check automation template.");
  }
}
