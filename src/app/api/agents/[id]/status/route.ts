import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { findAgentById } from "@/server/repositories/agents-repo";
import { getAgentOrchestratorStatus } from "@/server/services/agent-orchestrator-service";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) return badRequest("Agent ID is required.");
    const agent = findAgentById(user.id, project.id, id);
    if (!agent) return notFound("Agent not found.");
    if (agent.backend !== "agent-orchestrator") {
      return badRequest("Status endpoint is only supported for agent-orchestrator agents.");
    }

    const status = await getAgentOrchestratorStatus(agent.sessionId);
    return NextResponse.json({ agent, status }, { status: status.ok ? 200 : 502 });
  } catch (error) {
    return serverError(error, "Agent status error", "Failed to get agent status.");
  }
}
