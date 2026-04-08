import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { findAgentById, updateAgent } from "@/server/repositories/agents-repo";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) return badRequest("Agent ID is required.");
    const agent = findAgentById(user.id, project.id, id);
    if (!agent) return notFound("Agent not found.");
    if (agent.backend !== "agent-orchestrator") {
      return badRequest("Kill endpoint is only supported for agent-orchestrator agents.");
    }

    const updated = updateAgent(user.id, project.id, id, {
      sessionId: null,
      status: "paused",
    });

    return NextResponse.json({ msg: "Agent session cleared and agent paused.", agent: updated });
  } catch (error) {
    return serverError(error, "Agent kill error", "Failed to clear agent session.");
  }
}
