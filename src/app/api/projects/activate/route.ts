import { NextRequest, NextResponse } from "next/server";
import {
  ACTIVE_PROJECT_COOKIE,
  serializeProjectCookieValue,
} from "@/server/context/project-context";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";
import { serverError } from "@/server/http/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectId = String(url.searchParams.get("projectId") || "").trim();
    const nextPath = url.searchParams.get("next") || "/dashboard";

    const proxyUrl = new URL(req.url);
    if (projectId) {
      proxyUrl.searchParams.set("projectId", projectId);
    }
    const proxyReq = new Request(proxyUrl.toString(), {
      method: "GET",
      headers: req.headers,
    });
    const proxied = await proxyBackendRequest({
      req: proxyReq,
      projectId: projectId || "mission-control",
      path: "/projects",
      includeSearchParams: false,
    });
    if (!proxied.ok) {
      return proxied;
    }

    const payload = (await proxied.json()) as {
      activeProject?: { id?: string };
    };
    const activeId = String(payload.activeProject?.id || "").trim();
    if (!activeId) {
      return NextResponse.json({ msg: "Project not found." }, { status: 404 });
    }

    const redirectUrl = new URL(nextPath, url.origin);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(ACTIVE_PROJECT_COOKIE, serializeProjectCookieValue(activeId), {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    return serverError(error, "Activate project route error", "Failed to activate project.");
  }
}
