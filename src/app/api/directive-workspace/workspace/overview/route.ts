import { resolveProjectFromRequest } from "@/server/context/project-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { proxyDirectiveBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const project = resolveProjectFromRequest(req);
    return proxyDirectiveBackendRequest({
      req,
      projectId: project.id,
      path: "/directive-workspace/workspace/overview",
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_input:")) {
      return badRequest(error.message);
    }
    return serverError(
      error,
      "Directive workspace overview error",
      "Failed to load workspace overview.",
    );
  }
}
