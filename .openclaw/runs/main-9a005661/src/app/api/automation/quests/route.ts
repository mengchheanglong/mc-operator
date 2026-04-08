import { NextRequest, NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import {
  AUTOMATION_TOKEN_HEADER,
  requireAutomationToken,
} from "@/server/http/automation-auth";
import { badRequest, serverError } from "@/server/http/api-response";
import {
  createQuest,
  type QuestRow,
  type QuestStatus,
} from "@/server/repositories/quests-repo";
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

function serializeQuest(quest: QuestRow) {
  return {
    ...quest,
    _id: quest.id,
  };
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

    const quest = createQuest(user.id, project.id, goal, difficulty, topics, status, area);

    Promise.all([
      writeDashboardContextFiles(user.id, project),
      writeQuestContextFile(user.id, project, quest.id),
    ]).catch(console.error);

    return NextResponse.json({
      success: true,
      msg: "Automation quest created.",
      quest: serializeQuest(quest),
      automation: {
        source,
        area,
        status,
        metadata,
        topics: quest.topics,
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
