import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import { badRequest, serverError } from '@/server/http/api-response';
import { backendRequiredForWriteResponse } from '@/server/http/backend-write-policy';
import { proxyBackendRequest } from '@/server/http/directive-backend-proxy';
import { writeDashboardContextFiles, writeQuestContextFile } from '@/server/services/workspace-context-writer';
import { validateQuestStatusTransition } from '@/lib/workflow/mission-control-workflow';
import { validateVerificationEvidence } from '@/lib/workflow/verification-evidence';
import { appendLessonEvent } from '@/server/services/workflow-lessons-service';
import { getWorkspaceRootPath } from '@/server/projects/workspace-projects';

export const dynamic = 'force-dynamic';

type QuestDifficulty = 'easy' | 'normal' | 'hard' | 'nightmare' | 'hell';
type QuestStatus = 'open' | 'in_progress' | 'blocked' | 'done';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface QuestPayload {
  id?: string;
  _id?: string;
  goal?: string;
  status?: QuestStatus;
}

async function fetchQuestById(req: Request, projectId: string, id: string) {
  const fetchReq = new Request(req.url, {
    method: 'GET',
    headers: req.headers,
  });
  const response = await proxyBackendRequest({
    req: fetchReq,
    projectId,
    path: `/quests/${encodeURIComponent(id)}`,
    includeSearchParams: false,
  });

  if (response.status === 404) {
    return { quest: null, response: null as Response | null };
  }

  if (response.status === 502) {
    return {
      quest: null,
      response: backendRequiredForWriteResponse(
        'Quest',
        'Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry quest update or delete.',
      ),
    };
  }

  if (!response.ok) {
    return { quest: null, response };
  }

  const payload = (await response.json()) as { quest?: QuestPayload };
  if (!payload.quest) {
    return { quest: null, response: null as Response | null };
  }

  return { quest: payload.quest, response: null as Response | null };
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) {
      return badRequest('Quest ID is required.');
    }

    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: `/quests/${encodeURIComponent(id)}`,
      includeSearchParams: false,
    });

    if (response.status === 502) {
      return backendRequiredForWriteResponse(
        'Quest',
        'Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry quest delete.',
      );
    }

    if (!response.ok) {
      return response;
    }

    // Fire & forget context file updates
    writeDashboardContextFiles(user.id, project).catch(console.error);

    return response;
  } catch (error) {
    return serverError(error, 'Delete quest error');
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const reqForProxy = req.clone();
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    const body = await req.json();

    const existingLookup = await fetchQuestById(req, project.id, id);
    if (existingLookup.response) {
      return existingLookup.response;
    }

    const existingQuest = existingLookup.quest;
    if (!existingQuest) {
      return NextResponse.json({ msg: 'Quest not found.' }, { status: 404 });
    }

    const hasGoal = body.goal !== undefined;
    const goal = hasGoal ? String(body.goal || '').trim() : String(existingQuest.goal || '');

    if (hasGoal && !goal) {
      return NextResponse.json({ msg: 'Goal is required.' }, { status: 400 });
    }

    if (goal.length > 100) {
      return NextResponse.json({ msg: 'Goal must be 100 characters or less.' }, { status: 400 });
    }

    const updateData: {
      goal: string;
      difficulty?: QuestDifficulty;
      topics?: string[];
      status?: QuestStatus;
      area?: string | null;
      verificationSummary?: string;
      verificationEvidence?: {
        summary: string;
        commands: Array<{ command: string; output: string; status?: 'success' | 'warning' | 'error' }>;
      };
    } = { goal };

    if (body.difficulty && ['easy', 'normal', 'hard', 'nightmare', 'hell'].includes(body.difficulty)) {
      updateData.difficulty = body.difficulty as QuestDifficulty;
    }

    if (body.status && ['open', 'in_progress', 'blocked', 'done'].includes(body.status)) {
      updateData.status = body.status as QuestStatus;
    }

    let verificationEvidence: { summary: string; commands: Array<{ command: string; output: string; status?: 'success' | 'warning' | 'error' }> } | null = null;
    let verificationEvidenceFromPayload = false;

    if (updateData.status && updateData.status !== existingQuest.status) {
      const currentStatus = (existingQuest.status || 'open') as QuestStatus;
      const valid = validateQuestStatusTransition(currentStatus, updateData.status);
      if (!valid) {
        return NextResponse.json(
          { msg: `Invalid quest status transition: ${currentStatus} -> ${updateData.status}.` },
          { status: 409 },
        );
      }
      if (updateData.status === 'done') {
        const verificationSummary = String(body.verificationSummary || '').trim();
        const evidenceValidation = validateVerificationEvidence(body.verificationEvidence || null);

        if (evidenceValidation.ok && evidenceValidation.value) {
          verificationEvidenceFromPayload = true;
          verificationEvidence = evidenceValidation.value;
        } else if (verificationSummary) {
          verificationEvidence = { summary: verificationSummary, commands: [] };
        } else {
          return NextResponse.json(
            {
              msg: evidenceValidation.reason || 'verificationSummary or verificationEvidence is required before setting quest status to done.',
            },
            { status: 400 },
          );
        }
      }
    }

    if (body.area !== undefined) {
      updateData.area = String(body.area || '').trim() || null;
    }

    if (body.topics !== undefined) {
      updateData.topics = Array.isArray(body.topics)
        ? body.topics.map((topic: unknown) => String(topic || ""))
        : [];
    }

    if (verificationEvidenceFromPayload && verificationEvidence) {
      updateData.verificationEvidence = verificationEvidence;
    } else if (String(body.verificationSummary || '').trim()) {
      updateData.verificationSummary = String(body.verificationSummary || '').trim();
    }

    const proxiedReq = new Request(reqForProxy.url, {
      method: 'PUT',
      headers: reqForProxy.headers,
      body: JSON.stringify(updateData),
    });

    const response = await proxyBackendRequest({
      req: proxiedReq,
      projectId: project.id,
      path: `/quests/${encodeURIComponent(id)}`,
      includeSearchParams: false,
    });

    if (response.status === 502) {
      return backendRequiredForWriteResponse(
        'Quest',
        'Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry quest update.',
      );
    }

    if (!response.ok) {
      return response;
    }

    const payload = (await response.json()) as {
      msg?: string;
      quest?: QuestPayload;
      transition?: { from?: string; to?: string };
      verificationEvidence?: {
        summary: string;
        commands: Array<{ command: string; output: string; status?: 'success' | 'warning' | 'error' }>;
      } | null;
    };

    const quest = payload.quest;

    if (!quest) {
      return NextResponse.json({ msg: 'Quest not found.' }, { status: 404 });
    }

    // Fire & forget context file updates
    Promise.all([
      writeDashboardContextFiles(user.id, project),
      writeQuestContextFile(user.id, project, String(quest._id || quest.id || ''))
    ]).catch(console.error);

    const projectPath = `${getWorkspaceRootPath().replace(/\\/g, '/')}/${project.relativePath.replace(/\\/g, '/')}`;
    const nextStatus = (quest.status || existingQuest.status) as QuestStatus;
    const transition = {
      from: String(payload.transition?.from || existingQuest.status),
      to: String(payload.transition?.to || nextStatus),
    };
    const outcome = nextStatus === 'blocked' ? 'failure' : nextStatus === 'done' ? 'success' : 'manual_correction';
    await appendLessonEvent({
      projectPath,
      runType: 'quest',
      issueKey: `quest:${String(quest._id || quest.id || '')}`,
      summary: `Quest status ${transition.from} -> ${transition.to}${verificationEvidence ? ` (verification commands: ${verificationEvidence.commands.length})` : ''}`,
      outcome,
    });

    return NextResponse.json({
      msg: payload.msg || 'Quest updated.',
      quest,
      transition,
      verificationEvidence: payload.verificationEvidence ?? verificationEvidence,
    });
  } catch (error) {
    return serverError(error, 'Update quest error');
  }
}
