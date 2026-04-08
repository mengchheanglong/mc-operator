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
    const { id } = await params;
    return await proxyBackendRequest({
      req,
      projectId: project.id,
      path: `/agents/${encodeURIComponent(id)}/send`,
      includeSearchParams: false,
    });
  } catch (error) {
    return serverError(error, "Agent send error", "Failed to send message to agent session.");
  }
}
