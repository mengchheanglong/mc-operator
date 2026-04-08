import { resolveProjectFromRequest } from "@/server/context/project-context";
import { serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const project = resolveProjectFromRequest(req);
    const { id } = await params;
    return await proxyBackendRequest({
      req,
      projectId: project.id,
      path: `/agents/${encodeURIComponent(id)}/status`,
      includeSearchParams: true,
    });
  } catch (error) {
    return serverError(error, "Agent status error", "Failed to get agent status.");
  }
}
