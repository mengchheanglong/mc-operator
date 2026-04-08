import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const project = resolveProjectFromRequest(req);
    const { id } = await params;
    if (!id) {
      return badRequest("Template ID is required.");
    }

    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: `/automation/templates/${encodeURIComponent(id)}/run`,
    });
    if (!response.ok) {
      return response;
    }
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return serverError(
      error,
      "Run automation template error",
      "Failed to prepare automation run.",
    );
  }
}
