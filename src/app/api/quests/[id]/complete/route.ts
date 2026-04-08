import { NextResponse } from 'next/server';
import { resolveProjectFromRequest } from '@/server/context/project-context';
import { resolveUserContext } from '@/server/context/user-context';
import { badRequest, serverError } from '@/server/http/api-response';
import { backendRequiredForWriteResponse } from '@/server/http/backend-write-policy';
import { proxyBackendRequest } from '@/server/http/directive-backend-proxy';
import { validateVerificationEvidence } from '@/lib/workflow/verification-evidence';
import { writeDashboardContextFiles, writeQuestContextFile } from '@/server/services/workspace-context-writer';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface QuestPayload {
  id?: string;
  _id?: string;
  completed?: boolean;
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
        'Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry quest completion.',
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

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const reqForProxy = req.clone();
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) {
      return badRequest('Quest ID is required.');
    }

    const body = await req.json().catch(() => ({}));

    const existingLookup = await fetchQuestById(req, project.id, id);
    if (existingLookup.response) {
      return existingLookup.response;
    }

    const current = existingLookup.quest;
    if (!current) {
      return NextResponse.json({ msg: 'Quest not found.' }, { status: 404 });
    }

    if (!current.completed) {
      const verificationSummary = String((body as { verificationSummary?: unknown }).verificationSummary || '').trim();
      const evidenceValidation = validateVerificationEvidence((body as { verificationEvidence?: unknown }).verificationEvidence || null);
      if (!verificationSummary && !evidenceValidation.ok) {
        return NextResponse.json(
          { msg: evidenceValidation.reason || 'verificationSummary or verificationEvidence is required before completing a quest.' },
          { status: 400 },
        );
      }
    }

    const verificationSummary = String((body as { verificationSummary?: unknown }).verificationSummary || '').trim();
    const evidenceValidation = validateVerificationEvidence((body as { verificationEvidence?: unknown }).verificationEvidence || null);

    const proxiedReq = new Request(reqForProxy.url, {
      method: 'PUT',
      headers: reqForProxy.headers,
      body: JSON.stringify({
        verificationSummary: verificationSummary || undefined,
        verificationEvidence: evidenceValidation.ok ? evidenceValidation.value : (body as { verificationEvidence?: unknown }).verificationEvidence,
      }),
    });

    const response = await proxyBackendRequest({
      req: proxiedReq,
      projectId: project.id,
      path: `/quests/${encodeURIComponent(id)}/complete`,
      includeSearchParams: false,
    });

    if (response.status === 502) {
      return backendRequiredForWriteResponse(
        'Quest',
        'Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry quest completion.',
      );
    }

    if (!response.ok) {
      return response;
    }

    const payload = (await response.json()) as {
      msg?: string;
      quest?: QuestPayload;
      verificationEvidence?: unknown;
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

    return NextResponse.json({
      msg: payload.msg || (quest.completed ? 'Quest completed.' : 'Quest reopened.'),
      quest,
      verificationEvidence: payload.verificationEvidence ?? (evidenceValidation.ok ? evidenceValidation.value : null),
    });
  } catch (error) {
    return serverError(error, 'Toggle completion error');
  }
}
