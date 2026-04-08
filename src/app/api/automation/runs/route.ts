import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const project = resolveProjectFromRequest(req);
    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: "/automation/runs",
    });
    if (!response.ok) {
      return response;
    }
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return serverError(error, "List workspace runs error", "Failed to list workspace runs.");
  }
}
