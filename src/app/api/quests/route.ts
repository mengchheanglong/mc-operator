import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import { badRequest, serverError } from '@/server/http/api-response';
import { backendRequiredForWriteResponse } from '@/server/http/backend-write-policy';
import { proxyBackendRequest } from '@/server/http/directive-backend-proxy';
import { countQuests, countQuestsWithFilter, listQuests } from '@/server/repositories/quests-repo';
import { writeDashboardContextFiles, writeQuestContextFile } from '@/server/services/workspace-context-writer';

export const dynamic = 'force-dynamic';

type QuestStatus = 'open' | 'in_progress' | 'blocked' | 'done';

interface CreateQuestPayload {
  goal?: string;
  difficulty?: string;
  status?: QuestStatus;
  area?: string;
  topics?: string[];
}

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: '/quests',
    });

    if (response.status !== 502) {
      return response;
    }

    const url = new URL(req.url);
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '1000', 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 1000))
      : 1000;
    const parsedSkip = Number.parseInt(url.searchParams.get('skip') || '0', 10);
    const skip = Number.isFinite(parsedSkip) ? Math.max(0, parsedSkip) : 0;
    const completedRaw = url.searchParams.get('completed');
    const completed =
      completedRaw === 'true'
        ? true
        : completedRaw === 'false'
          ? false
          : undefined;
    const statusRaw = (url.searchParams.get('status') || '').trim();
    const status = (['open', 'in_progress', 'blocked', 'done'].includes(statusRaw)
      ? statusRaw
      : undefined) as QuestStatus | undefined;
    const area = (url.searchParams.get('area') || '').trim() || undefined;
    const withMeta = url.searchParams.get('withMeta') === '1';

    const quests = listQuests(user.id, project.id, {
      limit,
      skip,
      completed,
      status,
      area,
    }).map((quest) => ({
      ...quest,
      _id: quest.id,
    }));

    if (!withMeta) {
      return NextResponse.json(quests);
    }

    const total =
      typeof completed === 'boolean' && !status && !area
        ? countQuestsWithFilter(user.id, project.id, { completed })
        : completed === undefined && !status && !area
          ? countQuests(user.id, project.id)
          : countQuestsWithFilter(user.id, project.id, { completed, status, area });

    return NextResponse.json({
      quests,
      meta: {
        total,
        loaded: quests.length,
        hasMore: skip + quests.length < total,
        completed,
        status,
        area,
        statusCounts: {
          open: countQuestsWithFilter(user.id, project.id, { status: 'open' }),
          in_progress: countQuestsWithFilter(user.id, project.id, { status: 'in_progress' }),
          blocked: countQuestsWithFilter(user.id, project.id, { status: 'blocked' }),
          done: countQuestsWithFilter(user.id, project.id, { status: 'done' }),
        },
      },
    });
  } catch (error) {
    return serverError(error, 'Fetch quests error', 'Failed to fetch quests.');
  }
}

export async function POST(req: Request) {
  try {
    const reqForProxy = req.clone();
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const body = (await req.json()) as CreateQuestPayload;
    const goal = String(body.goal || '').trim();
    const rawDifficulty = String(body.difficulty || 'normal').trim().toLowerCase();
    const difficulty = (['easy', 'normal', 'hard', 'nightmare', 'hell'].includes(rawDifficulty) ? rawDifficulty : 'normal') as 'easy'|'normal'|'hard'|'nightmare'|'hell';
    const rawStatus = String(body.status || 'open').trim().toLowerCase();
    const status = (['open', 'in_progress', 'blocked', 'done'].includes(rawStatus) ? rawStatus : 'open') as QuestStatus;
    const area = String(body.area || '').trim();
    const topics = Array.isArray(body.topics)
      ? body.topics.map((topic) => String(topic || ""))
      : [];

    if (!goal) {
      return badRequest('Goal is required.');
    }

    if (goal.length > 100) {
      return badRequest('Goal must be 100 characters or less.');
    }

    const proxiedReq = new Request(reqForProxy.url, {
      method: 'POST',
      headers: reqForProxy.headers,
      body: JSON.stringify({
        goal,
        difficulty,
        topics,
        status,
        area,
      }),
    });

    const response = await proxyBackendRequest({
      req: proxiedReq,
      projectId: project.id,
      path: '/quests',
    });

    if (response.status === 502) {
      return backendRequiredForWriteResponse(
        "Quest",
        "Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry quest creation.",
      );
    }

    if (!response.ok) {
      return response;
    }

    const payload = (await response.json()) as {
      msg?: string;
      quest?: { id?: string; _id?: string };
    };

    const questId = String(payload.quest?._id || payload.quest?.id || '').trim();

    // Fire & forget context file updates
    const writes: Promise<unknown>[] = [writeDashboardContextFiles(user.id, project)];
    if (questId) {
      writes.push(writeQuestContextFile(user.id, project, questId));
    }
    Promise.all(writes).catch(console.error);

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return serverError(error, 'Create quest error');
  }
}
