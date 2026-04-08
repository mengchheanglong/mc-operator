import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import {
  countReports,
  listReports,
  type ReportCategory,
  type ReportStatus,
} from '@/server/repositories/reports-repo';
import { badRequest, serverError } from '@/server/http/api-response';
import { backendRequiredForWriteResponse } from '@/server/http/backend-write-policy';
import { proxyBackendRequest } from '@/server/http/directive-backend-proxy';
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

const REPORT_CATEGORIES: ReportCategory[] = [
  'system',
  'task',
  'chat',
  'file',
  'research',
  'error',
  'maintenance',
];

const REPORT_STATUSES: ReportStatus[] = ['info', 'success', 'warning', 'error'];
const REPORT_AREAS = ['automation', 'context', 'graph', 'ui'] as const;

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: "/reports",
    });

    if (response.status !== 502) {
      return response;
    }

    const url = new URL(req.url);
    const view = (url.searchParams.get('view') || '').trim().toLowerCase();
    if (view === 'daily') {
      const days = listDailyReportLogs(user.id, project.id);
      return NextResponse.json({ days });
    }

    const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 100))
      : 50;
    const parsedSkip = Number.parseInt(url.searchParams.get('skip') || '0', 10);
    const skip = Number.isFinite(parsedSkip) ? Math.max(0, parsedSkip) : 0;
    const withMeta = url.searchParams.get('withMeta') === '1';
    const categoryRaw = (url.searchParams.get('category') || '').trim().toLowerCase();
    const statusRaw = (url.searchParams.get('status') || '').trim().toLowerCase();
    const area = (url.searchParams.get('area') || '').trim() || undefined;
    const linkedQuestId = (url.searchParams.get('linkedQuestId') || '').trim() || undefined;
    const category = REPORT_CATEGORIES.includes(categoryRaw as ReportCategory)
      ? (categoryRaw as ReportCategory)
      : undefined;
    const status = REPORT_STATUSES.includes(statusRaw as ReportStatus)
      ? (statusRaw as ReportStatus)
      : undefined;

    const reports = listReports(user.id, project.id, {
      category,
      status,
      area,
      linkedQuestId,
      limit,
      skip,
    }).map((report) => ({
      ...report,
      _id: report.id,
    }));

    if (!withMeta) {
      return NextResponse.json(reports);
    }

    const total = countReports(user.id, project.id, {
      category,
      status,
      area,
      linkedQuestId,
    });

    return NextResponse.json({
      reports,
      meta: {
        total,
        loaded: reports.length,
        hasMore: skip + reports.length < total,
        categoryCounts: Object.fromEntries(
          REPORT_CATEGORIES.map((item) => [item, countReports(user.id, project.id, { category: item })]),
        ) as Record<ReportCategory, number>,
        areaCounts: Object.fromEntries(
          REPORT_AREAS.map((item) => [item, countReports(user.id, project.id, { area: item })]),
        ) as Record<(typeof REPORT_AREAS)[number], number>,
      },
    });
  } catch (error) {
    return serverError(error, 'Fetch reports error', 'Failed to fetch reports.');
  }
}

export async function POST(req: Request) {
  try {
    const reqForProxy = req.clone();
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

    const proxiedReq = new Request(reqForProxy.url, {
      method: "POST",
      headers: reqForProxy.headers,
      body: JSON.stringify({
        title,
        content,
        category,
        status,
        area,
        linkedQuestId: linkedQuestId || undefined,
        source,
        topics,
        metadata,
      }),
    });

    const response = await proxyBackendRequest({
      req: proxiedReq,
      projectId: project.id,
      path: "/reports",
    });
    if (response.status === 502) {
      return backendRequiredForWriteResponse(
        "Report",
        "Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry report creation.",
      );
    }

    if (!response.ok) {
      return response;
    }

    writeDashboardContextFiles(user.id, project).catch(console.error);

    return response;
  } catch (error) {
    return serverError(error, 'Create report error');
  }
}
