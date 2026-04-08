import { NextRequest } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import {
  requireAutomationToken,
} from "@/server/http/automation-auth";
import { serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAutomationToken(req);
  if (authError) {
    return authError;
  }

  try {
    const project = resolveProjectFromRequest(req);
    return await proxyBackendRequest({
      req,
      projectId: project.id,
      path: "/automation/session-brief",
    });
  } catch (error) {
    return serverError(
      error,
      "Automation session brief proxy error",
      "Failed to build automation session brief.",
    );
  }
}
