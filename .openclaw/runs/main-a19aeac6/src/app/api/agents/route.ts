import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { createAgent, listAgents } from "@/server/repositories/agents-repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);

    return NextResponse.json({
      agents: listAgents(user.id, project.id),
    });
  } catch (error) {
    return serverError(error, "List agents error", "Failed to fetch agents.");
  }
}

export async function POST(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const body = await req.json();
    const name = String(body.name || "").trim();

    if (!name) {
      return badRequest("Agent name is required.");
    }

    return NextResponse.json({
      msg: "Agent created.",
      agent: createAgent(user.id, project.id, body),
    });
  } catch (error) {
    return serverError(error, "Create agent error", "Failed to create agent.");
  }
}
