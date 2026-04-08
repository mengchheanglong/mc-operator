import { NextResponse } from "next/server";
import {
  ACTIVE_PROJECT_COOKIE,
  serializeProjectCookieValue,
} from "@/server/context/project-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

interface SetActiveProjectPayload {
  projectId?: string;
}

export async function POST(req: Request) {
  try {
    const reqForProxy = req.clone();
    const body = (await req.json()) as SetActiveProjectPayload;
    const projectId = String(body.projectId || "").trim();

    if (!projectId) {
      return badRequest("Project ID is required.");
    }

    const proxyUrl = new URL(reqForProxy.url);
    proxyUrl.searchParams.set("projectId", projectId);
    const proxyReq = new Request(proxyUrl.toString(), {
      method: "GET",
      headers: reqForProxy.headers,
    });

    const proxied = await proxyBackendRequest({
      req: proxyReq,
      projectId,
      path: "/projects",
      includeSearchParams: false,
    });
    if (!proxied.ok) {
      return proxied;
    }

    const payload = (await proxied.json()) as {
      activeProject?: {
        id?: string;
        name?: string;
        relativePath?: string;
        category?: string;
        projectType?: string;
      };
    };
    const active = payload.activeProject;
    if (!active?.id) {
      return NextResponse.json({ msg: "Project not found." }, { status: 404 });
    }

    const response = NextResponse.json({
      msg: "Active project updated.",
      project: {
        id: active.id,
        name: active.name || active.id,
        relativePath: active.relativePath || active.id,
        category: active.category || "root",
        projectType: active.projectType || "external",
      },
    });

    response.cookies.set(ACTIVE_PROJECT_COOKIE, serializeProjectCookieValue(active.id), {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    return serverError(error, "Set active project error", "Failed to set active project.");
  }
}
