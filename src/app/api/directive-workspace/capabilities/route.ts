import { resolveProjectFromRequest } from "@/server/context/project-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { proxyDirectiveBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const project = resolveProjectFromRequest(req);
    const url = new URL(req.url);
    const view = url.searchParams.get("view");

    if (view === "registry") {
      return proxyDirectiveBackendRequest({
        req,
        projectId: project.id,
        path: "/directive-workspace/registry",
        dropSearchParams: ["view"],
      });
    }

    return proxyDirectiveBackendRequest({
      req,
      projectId: project.id,
      path: "/directive-workspace/capabilities",
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_input:")) {
      return badRequest(error.message);
    }
    return serverError(
      error,
      "Directive capability list error",
      "Failed to list directive capabilities.",
    );
  }
}

export async function POST(req: Request) {
  try {
    const project = resolveProjectFromRequest(req);
    return proxyDirectiveBackendRequest({
      req,
      projectId: project.id,
      path: "/directive-workspace/capabilities",
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_input:")) {
      return badRequest(error.message);
    }
    return serverError(
      error,
      "Directive capability create error",
      "Failed to create directive capability.",
    );
  }
}
