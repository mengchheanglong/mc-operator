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
      path: `/automation/runs/${encodeURIComponent(runId)}/tooling-audit`,
      includeSearchParams: false,
    });
    if (!response.ok) {
      return response;
    }
    const payload = await response.json();
    const proxied = NextResponse.json(payload, { status: response.status });
    proxied.headers.set(
      "X-Mission-Control-Deprecated",
      "tooling-audit endpoint; use /tools with desloppify-prototype",
    );
    return proxied;
  } catch (error) {
    return serverError(error, "Run tooling audit error", "Failed to run tooling audit.");
  }
}
