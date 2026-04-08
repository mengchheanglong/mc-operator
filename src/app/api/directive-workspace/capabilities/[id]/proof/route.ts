import { resolveProjectFromRequest } from "@/server/context/project-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { proxyDirectiveBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const project = resolveProjectFromRequest(req);
    const { id } = await params;
    if (!id) return badRequest("Capability ID is required.");
    return proxyDirectiveBackendRequest({
      req,
      projectId: project.id,
      path: `/directive-workspace/capabilities/${encodeURIComponent(id)}/proof`,
      includeSearchParams: false,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_input:")) {
      return badRequest(error.message);
    }
    return serverError(
      error,
      "Directive proof error",
      "Failed to create directive integration proof.",
    );
  }
}
