import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import { listQuests, createQuest, type QuestRow } from '@/server/repositories/quests-repo';
import { badRequest, serverError } from '@/server/http/api-response';
import { writeDashboardContextFiles, writeQuestContextFile } from '@/server/services/workspace-context-writer';

export const dynamic = 'force-dynamic';

interface CreateQuestPayload {
  goal?: string;
  difficulty?: string;
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

    const quests = listQuests(user.id, project.id, { limit, skip });

    return NextResponse.json(
      quests.map((quest) => ({
        ...quest,
        _id: String(quest.id),
      })),
    );
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

    if (!goal) {
      return badRequest('Goal is required.');
    }

    if (goal.length > 100) {
      return badRequest('Goal must be 100 characters or less.');
    }

    const quest = createQuest(user.id, project.id, goal, difficulty);

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
