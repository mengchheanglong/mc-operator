import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { findAutomationTemplateById } from "@/server/repositories/automation-templates-repo";
import { listTemplateRuns } from "@/server/repositories/automation-template-runs-repo";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) return badRequest("Template ID is required.");

    const template = findAutomationTemplateById(user.id, project.id, id);
    if (!template) return notFound("Automation template not found.");

    return NextResponse.json({
      success: true,
      templateId: template.id,
      runs: listTemplateRuns(user.id, project.id, template.id, 20),
    });
  } catch (error) {
    return serverError(error, "List template runs error", "Failed to fetch template runs.");
  }
}
