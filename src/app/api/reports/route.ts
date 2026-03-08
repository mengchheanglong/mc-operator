import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import { listReports, createReport, type ReportCategory, type ReportStatus, type ReportRow } from '@/server/repositories/reports-repo';
import { badRequest, serverError } from '@/server/http/api-response';
import { writeDashboardContextFiles } from '@/server/services/workspace-context-writer';

export const dynamic = 'force-dynamic';

interface CreateReportPayload {
  title?: string;
  content?: string;
  category?: ReportCategory;
  status?: ReportStatus;
  metadata?: Record<string, any>;
  source?: string;
}

function serializeReport(report: ReportRow) {
  return {
    ...report,
    _id: report.id, // For backward compatibility
  };
}

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { searchParams } = new URL(req.url);

    const paramLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = isNaN(paramLimit) || paramLimit < 1 ? 50 : Math.min(paramLimit, 100);

    const paramSkip = parseInt(searchParams.get('skip') || '0', 10);
    const skip = isNaN(paramSkip) || paramSkip < 0 ? 0 : paramSkip;

    const category = searchParams.get('category') as ReportCategory | null;
    const status = searchParams.get('status') as ReportStatus | null;

    const reports = listReports(user.id, project.id, {
      limit,
      skip,
      category: category || undefined,
      status: status || undefined,
    });

    return NextResponse.json(reports.map(serializeReport));
  } catch (error) {
    return serverError(error, 'Fetch reports error', 'Failed to fetch reports.');
  }
}

export async function POST(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const body = (await req.json()) as CreateReportPayload;

    const title = String(body.title || '').trim();
    const content = String(body.content || '').trim();
    const category = body.category || 'system';
    const status = body.status || 'info';
    const metadata = body.metadata || {};
    const source = String(body.source || 'OpenClaw').trim();

    if (!title) {
      return badRequest('Title is required.');
    }

    if (!content) {
      return badRequest('Content is required.');
    }

    if (title.length > 200) {
      return badRequest('Title must be 200 characters or less.');
    }

    if (content.length > 5000) {
      return badRequest('Content must be 5000 characters or less.');
    }

    const report = createReport(user.id, project.id, {
      title,
      content,
      category,
      status,
      source,
      metadata,
    });

    writeDashboardContextFiles(user.id, project).catch(console.error);

    return NextResponse.json({
      msg: 'Report created.',
      report: serializeReport(report),
    });
  } catch (error) {
    return serverError(error, 'Create report error');
  }
}
