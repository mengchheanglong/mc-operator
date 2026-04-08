import { resolveProjectFromRequest } from "@/server/context/project-context";
import { serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const project = resolveProjectFromRequest(req);
    return await proxyBackendRequest({
      req,
      projectId: project.id,
      path: "/agents/import-packs",
      includeSearchParams: false,
    });
  } catch (error) {
    return serverError(error, "Import agent packs error", "Failed to import agent packs.");
  }
}
