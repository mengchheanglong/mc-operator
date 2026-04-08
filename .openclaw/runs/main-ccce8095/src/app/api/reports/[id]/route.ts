import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import { deleteReport, findReportById } from '@/server/repositories/reports-repo';
import { badRequest, notFound, serverError } from '@/server/http/api-response';
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

    const report = findReportById(user.id, project.id, id);

    if (!report) {
      return notFound('Report not found.');
    }

    deleteReport(user.id, project.id, id);
    writeDashboardContextFiles(user.id, project).catch(console.error);

    return NextResponse.json({ msg: 'Report deleted.' });
  } catch (error) {
    return serverError(error, 'Delete report error', 'Failed to delete report.');
  }
}
