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
      path: `/agents/${encodeURIComponent(id)}/pack-assets`,
      includeSearchParams: false,
    });
  } catch (error) {
    return serverError(error, "Agent pack assets error", "Failed to preview agent pack assets.");
  }
}
