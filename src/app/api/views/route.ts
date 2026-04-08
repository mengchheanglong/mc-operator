import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { backendRequiredForWriteResponse } from "@/server/http/backend-write-policy";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

interface CreateSavedViewPayload {
  surface?: "quests" | "reports";
  name?: string;
  filters?: Record<string, unknown>;
}

function normalizeSurface(value: string | null | undefined) {
  return value === "quests" || value === "reports" ? value : null;
}

export async function GET(req: Request) {
  try {
    await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { searchParams } = new URL(req.url);
    const surface = normalizeSurface(searchParams.get("surface"));

    if (!surface) {
      return badRequest("Surface is required.");
    }

    return proxyBackendRequest({
      req,
      projectId: project.id,
      path: "/views",
    });
  } catch (error) {
    return serverError(error, "Fetch saved views error", "Failed to fetch saved views.");
  }
}

export async function POST(req: Request) {
  try {
    const reqForProxy = req.clone();
    await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const body = (await req.json()) as CreateSavedViewPayload;
    const surface = normalizeSurface(body.surface);
    const name = String(body.name || "").trim();
    const filters =
      body.filters && typeof body.filters === "object" && !Array.isArray(body.filters)
        ? body.filters
        : {};

    if (!surface) {
      return badRequest("Surface is required.");
    }

    if (!name) {
      return badRequest("View name is required.");
    }

    const proxyReq = new Request(reqForProxy.url, {
      method: "POST",
      headers: reqForProxy.headers,
      body: JSON.stringify({
        surface,
        name,
        filters,
      }),
    });

    const response = await proxyBackendRequest({
      req: proxyReq,
      projectId: project.id,
      path: "/views",
    });

    if (response.status === 502) {
      return backendRequiredForWriteResponse("Saved view");
    }

    return response;
  } catch (error) {
    return serverError(error, "Create saved view error", "Failed to create saved view.");
  }
}
