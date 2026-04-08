import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { findAgentById } from "@/server/repositories/agents-repo";
import { sendAgentOrchestratorMessage } from "@/server/services/agent-orchestrator-service";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message || "").trim();

    if (!id) return badRequest("Agent ID is required.");
    const agent = findAgentById(user.id, project.id, id);
    if (!agent) return notFound("Agent not found.");
    if (agent.backend !== "agent-orchestrator") return badRequest("Send is only supported for agent-orchestrator agents.");
    if (!agent.sessionId) return badRequest("This agent does not have an active session.");
    if (!message) return badRequest("Message is required.");

    const result = await sendAgentOrchestratorMessage(agent.sessionId, message);
    return NextResponse.json({ agent, result }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return serverError(error, "Agent send error", "Failed to send message to agent session.");
  }
}
