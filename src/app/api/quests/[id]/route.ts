import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import { updateQuest, deleteQuest, type QuestRow } from '@/server/repositories/quests-repo';
import { serverError } from '@/server/http/api-response';
import { writeDashboardContextFiles, writeQuestContextFile } from '@/server/services/workspace-context-writer';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

function serializeQuest(quest: QuestRow) {
  return {
    ...quest,
    _id: quest.id,
  };
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    const success = deleteQuest(user.id, project.id, id);
    if (!success) {
      return NextResponse.json({ msg: 'Quest not found.' }, { status: 404 });
    }

    // Fire & forget context file updates
    writeDashboardContextFiles(user.id, project).catch(console.error);

    return NextResponse.json({ msg: 'Quest deleted.' });
  } catch (error) {
    return serverError(error, 'Delete quest error');
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    const body = await req.json();
    const goal = String(body.goal || '').trim();

    if (!goal) {
      return NextResponse.json({ msg: 'Goal is required.' }, { status: 400 });
    }

    if (goal.length > 100) {
      return NextResponse.json({ msg: 'Goal must be 100 characters or less.' }, { status: 400 });
    }

    const updateData: { goal: string; difficulty?: 'easy' | 'normal' | 'hard' | 'nightmare' | 'hell' } = { goal };

    if (body.difficulty && ['easy', 'normal', 'hard', 'nightmare', 'hell'].includes(body.difficulty)) {
      updateData.difficulty = body.difficulty as 'easy' | 'normal' | 'hard' | 'nightmare' | 'hell';
    }

    const quest = updateQuest(user.id, project.id, id, updateData);

    if (!quest) {
      return NextResponse.json({ msg: 'Quest not found.' }, { status: 404 });
    }

    // Fire & forget context file updates
    Promise.all([
      writeDashboardContextFiles(user.id, project),
      writeQuestContextFile(user.id, project, quest.id)
    ]).catch(console.error);

    return NextResponse.json({ msg: 'Quest updated.', quest: serializeQuest(quest) });
  } catch (error) {
    return serverError(error, 'Update quest error');
  }
}
