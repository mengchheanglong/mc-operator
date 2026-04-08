import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { backendRequiredForWriteResponse } from "@/server/http/backend-write-policy";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) {
      return badRequest("Saved view ID is required.");
    }

    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: `/views/${encodeURIComponent(id)}`,
    });

    if (response.status === 502) {
      return backendRequiredForWriteResponse("Saved view");
    }

    return response;
  } catch (error) {
    return serverError(error, "Delete saved view error", "Failed to delete saved view.");
  }
}
