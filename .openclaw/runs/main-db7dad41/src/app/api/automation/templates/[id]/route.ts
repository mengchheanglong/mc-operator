import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import {
  deleteAutomationTemplate,
  updateAutomationTemplate,
} from "@/server/repositories/automation-templates-repo";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;
    const body = await req.json();

    if (!id) {
      return badRequest("Template ID is required.");
    }

    const template = updateAutomationTemplate(user.id, project.id, id, body);
    if (!template) {
      return notFound("Automation template not found.");
    }

    return NextResponse.json({
      msg: "Automation template updated.",
      template,
    });
  } catch (error) {
    return serverError(error, "Update automation template error", "Failed to update automation template.");
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) {
      return badRequest("Template ID is required.");
    }

    const deleted = deleteAutomationTemplate(user.id, project.id, id);
    if (!deleted) {
      return notFound("Automation template not found.");
    }

    return NextResponse.json({ msg: "Automation template deleted." });
  } catch (error) {
    return serverError(error, "Delete automation template error", "Failed to delete automation template.");
  }
}
