import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const project = resolveProjectFromRequest(req);
    const { id: runId } = await params;
    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: `/automation/runs/${encodeURIComponent(runId)}/tools`,
      includeSearchParams: false,
    });
    if (!response.ok) {
      return response;
    }
    const payload = await response.json();
    const proxied = NextResponse.json(payload, { status: response.status });
    if ((payload as { deprecation?: unknown }).deprecation) {
      const deprecation = (payload as { deprecation?: { toolId?: string; canonicalToolId?: string } }).deprecation;
      if (deprecation?.toolId && deprecation?.canonicalToolId) {
        proxied.headers.set(
          "X-Mission-Control-Deprecated",
          `${deprecation.toolId}; use ${deprecation.canonicalToolId}`,
        );
      }
    }
    return proxied;
  } catch (error) {
    return serverError(error, "Run tool invocation error", "Failed to execute run-scoped tool.");
  }
}
