import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import { badRequest, serverError } from '@/server/http/api-response';
import { backendRequiredForWriteResponse } from '@/server/http/backend-write-policy';
import { proxyBackendRequest } from '@/server/http/directive-backend-proxy';
import { writeDashboardContextFiles } from '@/server/services/workspace-context-writer';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) {
      return badRequest('Report ID is required.');
    }

    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: `/reports/${encodeURIComponent(id)}`,
    });
    if (response.status === 502) {
      return backendRequiredForWriteResponse(
        "Report",
        "Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry report deletion.",
      );
    }

    if (!response.ok) {
      return response;
    }

    writeDashboardContextFiles(user.id, project).catch(console.error);

    return response;
  } catch (error) {
    return serverError(error, 'Delete report error', 'Failed to delete report.');
  }
}
