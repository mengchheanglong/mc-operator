import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { backendRequiredForWriteResponse } from "@/server/http/backend-write-policy";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";
import { writeDashboardContextFiles } from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

interface CreateNotePayload {
  content?: string;
}

export async function GET(req: Request) {
  try {
    await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    return proxyBackendRequest({
      req,
      projectId: project.id,
      path: "/notes",
    });
  } catch (error) {
    return serverError(error, "Fetch notes error");
  }
}

export async function POST(req: Request) {
  try {
    const reqForProxy = req.clone();
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);

    const body = (await req.json()) as CreateNotePayload;
    const content = String(body.content || "").trim();

    if (!content) {
      return badRequest("Note content is required.");
    }

    if (content.length > 500) {
      return badRequest("Note content must be 500 characters or less.");
    }

    const proxiedReq = new Request(reqForProxy.url, {
      method: "POST",
      headers: reqForProxy.headers,
      body: JSON.stringify({ content }),
    });

    const response = await proxyBackendRequest({
      req: proxiedReq,
      projectId: project.id,
      path: "/notes",
    });

    if (response.status === 502) {
      return backendRequiredForWriteResponse("Note");
    }

    if (!response.ok) {
      return response;
    }

    writeDashboardContextFiles(user.id, project).catch(console.error);

    return response;
  } catch (error) {
    return serverError(error, "Create note error");
  }
}
