import { resolveProjectFromRequest } from "@/server/context/project-context";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { proxyDirectiveBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) return badRequest("Capability ID is required.");
    const response = await proxyDirectiveBackendRequest({
      req,
      projectId: project.id,
      path: `/directive-workspace/capabilities/${encodeURIComponent(id)}/lifecycle`,
      includeSearchParams: false,
      mapMissingCapabilityTo404: true,
    });
    if (response.status === 404) {
      return notFound("Directive capability not found.");
    }
    return response;
  } catch (error) {
    return serverError(
      error,
      "Directive capability get error",
      "Failed to get directive capability.",
    );
  }
}
