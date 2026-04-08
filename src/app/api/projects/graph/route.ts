import { resolveProjectFromRequest } from "@/server/context/project-context";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";
import { serverError } from "@/server/http/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const activeProject = resolveProjectFromRequest(req);
    return proxyBackendRequest({
      req,
      projectId: activeProject.id,
      path: "/projects/graph",
    });
  } catch (error) {
    return serverError(
      error,
      "Projects graph error",
      "Failed to load project graph.",
    );
  }
}
