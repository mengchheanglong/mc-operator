import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import {
  countCompletedQuests,
  countOpenQuests,
  countQuests,
  countQuestsWithFilter,
  listQuests,
  createQuest,
  type QuestStatus,
  type QuestRow,
} from '@/server/repositories/quests-repo';
import { badRequest, serverError } from '@/server/http/api-response';
import { writeDashboardContextFiles, writeQuestContextFile } from '@/server/services/workspace-context-writer';

export const dynamic = 'force-dynamic';

interface CreateQuestPayload {
  goal?: string;
  difficulty?: string;
  status?: QuestStatus;
  area?: string;
  topics?: string[];
}

function serializeQuest(quest: QuestRow) {
  return {
    ...quest,
    _id: quest.id,
  };
}

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { searchParams } = new URL(req.url);

    const paramLimit = parseInt(searchParams.get('limit') || '1000', 10);
    const limit = isNaN(paramLimit) || paramLimit < 1 ? 1000 : Math.min(paramLimit, 1000);

    const paramSkip = parseInt(searchParams.get('skip') || '0', 10);
    const skip = isNaN(paramSkip) || paramSkip < 0 ? 0 : paramSkip;
    const completedParam = searchParams.get('completed');
    const completed =
      completedParam === 'true' ? true : completedParam === 'false' ? false : undefined;
    const statusParam = searchParams.get('status');
    const status = (statusParam && ['open', 'in_progress', 'blocked', 'done'].includes(statusParam)
      ? statusParam
      : undefined) as QuestStatus | undefined;
    const area = searchParams.get('area') || undefined;
    const withMeta = searchParams.get('withMeta') === '1';

    const quests = listQuests(user.id, project.id, { limit, skip, completed, status, area });
    const serialized = quests.map((quest) => ({
      ...quest,
      _id: String(quest.id),
    }));

    if (!withMeta) {
      return NextResponse.json(serialized);
    }

    const total =
      typeof completed === 'boolean' && !status && !area
        ? completed
          ? countCompletedQuests(user.id, project.id)
          : countOpenQuests(user.id, project.id)
        : !completed && !status && !area
          ? countQuests(user.id, project.id)
          : countQuestsWithFilter(user.id, project.id, { completed, status, area });

    return NextResponse.json({
      quests: serialized,
      meta: {
        total,
        loaded: serialized.length,
        hasMore: skip + serialized.length < total,
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

    const quest = createQuest(user.id, project.id, goal, difficulty, topics, status, area);

    // Fire & forget context file updates
    Promise.all([
      writeDashboardContextFiles(user.id, project),
      writeQuestContextFile(user.id, project, quest.id)
    ]).catch(console.error);

    return NextResponse.json({
      msg: 'Quest created.',
      quest: serializeQuest(quest),
    });
  } catch (error) {
    return serverError(error, 'Create quest error');
  }
}
