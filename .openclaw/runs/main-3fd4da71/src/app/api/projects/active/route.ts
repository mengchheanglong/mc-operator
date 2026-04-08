import { NextResponse } from "next/server";
import {
  ACTIVE_PROJECT_COOKIE,
  listAvailableProjects,
  serializeProjectCookieValue,
} from "@/server/context/project-context";
import { badRequest } from "@/server/http/api-response";

export const dynamic = "force-dynamic";

interface SetActiveProjectPayload {
  projectId?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as SetActiveProjectPayload;
  const projectId = String(body.projectId || "").trim();

  if (!projectId) {
    return badRequest("Project ID is required.");
  }

  const project = listAvailableProjects().find((entry) => entry.id === projectId);
  if (!project) {
    return NextResponse.json({ msg: "Project not found." }, { status: 404 });
  }

  const response = NextResponse.json({
    msg: "Active project updated.",
    project: {
      id: project.id,
      name: project.name,
      relativePath: project.relativePath,
      category: project.category,
    },
  });

  response.cookies.set(ACTIVE_PROJECT_COOKIE, serializeProjectCookieValue(project.id), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
