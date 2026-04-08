import { resolveProjectFromRequest } from "@/server/context/project-context";
import { serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const project = resolveProjectFromRequest(req);
    return await proxyBackendRequest({
      req,
      projectId: project.id,
      path: "/agents",
      includeSearchParams: false,
    });
  } catch (error) {
    return serverError(error, "List agents error", "Failed to fetch agents.");
  }
}

export async function POST(req: Request) {
  try {
    const project = resolveProjectFromRequest(req);
    return await proxyBackendRequest({
      req,
      projectId: project.id,
      path: "/agents",
      includeSearchParams: false,
    });
  } catch (error) {
    return serverError(error, "Create agent error", "Failed to create agent.");
  }
}
