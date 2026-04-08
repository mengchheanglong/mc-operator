import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { backendRequiredForWriteResponse } from "@/server/http/backend-write-policy";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";
import { writeDashboardContextFiles } from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface UpdateNotePayload {
  content?: string;
  completed?: boolean;
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const reqForProxy = req.clone();
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);

    const { id } = await params;

    const body = (await req.json()) as UpdateNotePayload;
    
    let content: string | undefined;
    if (body.content !== undefined) {
      content = String(body.content).trim();
      if (!content) {
        return badRequest("Note content cannot be empty.");
      }
      if (content.length > 500) {
        return badRequest("Note content must be 500 characters or less.");
      }
    }

    const updateData: Partial<{ content: string; completed: boolean }> = {};
    if (content !== undefined) {
      updateData.content = content;
    }
    if (body.completed !== undefined) {
      updateData.completed = Boolean(body.completed);
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest("No valid fields provided for update.");
    }

    const proxiedReq = new Request(reqForProxy.url, {
      method: "PUT",
      headers: reqForProxy.headers,
      body: JSON.stringify(updateData),
    });

    const response = await proxyBackendRequest({
      req: proxiedReq,
      projectId: project.id,
      path: `/notes/${encodeURIComponent(id)}`,
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
    return serverError(error, "Update note error");
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);

    const { id } = await params;

    if (!id) {
      return badRequest("Note ID is required.");
    }

    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: `/notes/${encodeURIComponent(id)}`,
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
    return serverError(error, "Delete note error");
  }
}
