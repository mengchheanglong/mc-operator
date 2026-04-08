import { NextRequest, NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import {
  AUTOMATION_TOKEN_HEADER,
  requireAutomationToken,
} from "@/server/http/automation-auth";
import { badRequest, serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";
import { type QuestStatus } from "@/server/repositories/quests-repo";
import {
  writeDashboardContextFiles,
  writeQuestContextFile,
} from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

type QuestDifficulty = "easy" | "normal" | "hard" | "nightmare" | "hell";

interface AutomationQuestPayload {
  goal?: string;
  difficulty?: string;
  status?: QuestStatus;
  area?: string;
  topics?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

function normalizeDifficulty(value: string): QuestDifficulty {
  const normalized = value.trim().toLowerCase();
  return (["easy", "normal", "hard", "nightmare", "hell"].includes(normalized)
    ? normalized
    : "normal") as QuestDifficulty;
}

export async function POST(req: NextRequest) {
  const authError = requireAutomationToken(req);
  if (authError) {
    return authError;
  }

  try {
    const reqForProxy = req.clone();
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const body = (await req.json()) as AutomationQuestPayload;

    const goal = String(body.goal || "").trim();
    const difficulty = normalizeDifficulty(String(body.difficulty || "normal"));
    const normalizedStatus = String(body.status || "open").trim().toLowerCase();
    const status = (["open", "in_progress", "blocked", "done"].includes(normalizedStatus)
      ? normalizedStatus
      : "open") as QuestStatus;
    const area = String(body.area || "").trim();
    const topics = Array.isArray(body.topics)
      ? body.topics.map((topic) => String(topic || ""))
      : [];
    const source = String(body.source || "n8n").trim();
    const metadata = body.metadata || {};

    if (!goal) {
      return badRequest("Goal is required.");
    }

    if (goal.length > 100) {
      return badRequest("Goal must be 100 characters or less.");
    }

    const proxiedReq = new Request(reqForProxy.url, {
      method: "POST",
      headers: reqForProxy.headers,
      body: JSON.stringify({
        goal,
        difficulty,
        status,
        area,
        topics,
      }),
    });

    const response = await proxyBackendRequest({
      req: proxiedReq,
      projectId: project.id,
      path: "/quests",
    });
    if (!response.ok) {
      return response;
    }

    const payload = (await response.json()) as {
      quest?: Record<string, unknown> & { id?: string; _id?: string; topics?: string[] };
    };
    const quest = payload.quest || null;
    const questId = String(quest?._id || quest?.id || "").trim();

    Promise.all([
      writeDashboardContextFiles(user.id, project),
      questId
        ? writeQuestContextFile(user.id, project, questId)
        : Promise.resolve(),
    ]).catch(console.error);

    return NextResponse.json({
      success: true,
      msg: "Automation quest created.",
      quest,
      automation: {
        source,
        area,
        status,
        metadata,
        topics: Array.isArray(quest?.topics) ? quest?.topics : [],
        tokenHeader: AUTOMATION_TOKEN_HEADER,
      },
    });
  } catch (error) {
    return serverError(
      error,
      "Automation quest creation error",
      "Failed to create automation quest.",
    );
  }
}
