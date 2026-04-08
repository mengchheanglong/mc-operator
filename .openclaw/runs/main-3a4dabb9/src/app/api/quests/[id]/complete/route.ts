import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import { toggleQuestCompletion } from '@/server/repositories/quests-repo';
import { writeDashboardContextFiles, writeQuestContextFile } from '@/server/services/workspace-context-writer';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    const quest = toggleQuestCompletion(user.id, project.id, id);
    if (!quest) {
      return NextResponse.json({ msg: 'Quest not found.' }, { status: 404 });
    }

    // Fire & forget context file updates
    Promise.all([
      writeDashboardContextFiles(user.id, project),
      writeQuestContextFile(user.id, project, quest.id)
    ]).catch(console.error);

    return NextResponse.json({
      msg: quest.completed ? 'Quest completed.' : 'Quest reopened.',
      quest: {
        ...quest,
        _id: quest.id,
      },
    });
  } catch (error) {
    console.error('Toggle completion error:', error);
    return NextResponse.json({ msg: 'Server error.' }, { status: 500 });
  }
}
