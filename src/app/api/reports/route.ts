import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import { countReports, listReports, createReport, type ReportCategory, type ReportStatus, type ReportRow } from '@/server/repositories/reports-repo';
import { badRequest, serverError } from '@/server/http/api-response';
import { listDailyReportLogs } from '@/server/services/daily-report-log-service';
import { writeDashboardContextFiles } from '@/server/services/workspace-context-writer';

export const dynamic = 'force-dynamic';

interface CreateReportPayload {
  title?: string;
  content?: string;
  category?: ReportCategory;
  status?: ReportStatus;
  area?: string;
  linkedQuestId?: string;
  topics?: string[];
  metadata?: Record<string, unknown>;
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
    const view = searchParams.get("view");

    if (view === "daily") {
      return NextResponse.json({
        days: listDailyReportLogs(user.id, project.id),
      });
    }

    const paramLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = isNaN(paramLimit) || paramLimit < 1 ? 50 : Math.min(paramLimit, 100);

    const paramSkip = parseInt(searchParams.get('skip') || '0', 10);
    const skip = isNaN(paramSkip) || paramSkip < 0 ? 0 : paramSkip;
    const withMeta = searchParams.get('withMeta') === '1';

    const category = searchParams.get('category') as ReportCategory | null;
    const status = searchParams.get('status') as ReportStatus | null;
    const area = searchParams.get('area');
    const linkedQuestId = searchParams.get('linkedQuestId');

    const reports = listReports(user.id, project.id, {
      limit,
      skip,
      category: category || undefined,
      status: status || undefined,
      area: area || undefined,
      linkedQuestId: linkedQuestId || undefined,
    });

    const serialized = reports.map(serializeReport);

    if (!withMeta) {
      return NextResponse.json(serialized);
    }

    return NextResponse.json({
      reports: serialized,
      meta: {
        total: countReports(user.id, project.id, {
          category: category || undefined,
          status: status || undefined,
          area: area || undefined,
          linkedQuestId: linkedQuestId || undefined,
        }),
        loaded: serialized.length,
        hasMore:
          skip + serialized.length <
          countReports(user.id, project.id, {
            category: category || undefined,
            status: status || undefined,
            area: area || undefined,
            linkedQuestId: linkedQuestId || undefined,
          }),
        categoryCounts: {
          system: countReports(user.id, project.id, { category: 'system' }),
          task: countReports(user.id, project.id, { category: 'task' }),
          chat: countReports(user.id, project.id, { category: 'chat' }),
          file: countReports(user.id, project.id, { category: 'file' }),
          research: countReports(user.id, project.id, { category: 'research' }),
          error: countReports(user.id, project.id, { category: 'error' }),
          maintenance: countReports(user.id, project.id, { category: 'maintenance' }),
        },
        areaCounts: {
          automation: countReports(user.id, project.id, { area: 'automation' }),
          context: countReports(user.id, project.id, { area: 'context' }),
          graph: countReports(user.id, project.id, { area: 'graph' }),
          ui: countReports(user.id, project.id, { area: 'ui' }),
        },
      },
    });
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
    const area = String(body.area || '').trim();
    const linkedQuestId = String(body.linkedQuestId || '').trim();
    const topics = Array.isArray(body.topics)
      ? body.topics.map((topic) => String(topic || ""))
      : [];
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
      area,
      linkedQuestId: linkedQuestId || undefined,
      source,
      topics,
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
