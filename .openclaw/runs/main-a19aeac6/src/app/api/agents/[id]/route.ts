import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { deleteAgent, updateAgent } from "@/server/repositories/agents-repo";

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
      return badRequest("Agent ID is required.");
    }

    const agent = updateAgent(user.id, project.id, id, body);
    if (!agent) {
      return notFound("Agent not found.");
    }

    return NextResponse.json({
      msg: "Agent updated.",
      agent,
    });
  } catch (error) {
    return serverError(error, "Update agent error", "Failed to update agent.");
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) {
      return badRequest("Agent ID is required.");
    }

    const deleted = deleteAgent(user.id, project.id, id);
    if (!deleted) {
      return notFound("Agent not found.");
    }

    return NextResponse.json({ msg: "Agent deleted." });
  } catch (error) {
    return serverError(error, "Delete agent error", "Failed to delete agent.");
  }
}
