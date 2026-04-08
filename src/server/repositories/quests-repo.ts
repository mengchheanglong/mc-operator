import { and, desc, eq, lte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { inferWorkItemTopics } from "@/lib/topics/infer-work-item-topics";
import { normalizeTopics } from "@/lib/topics";
import { db } from "@/server/sqlite/db";
import { parseJsonField, stringifyJsonField } from "@/server/sqlite/json";
import { quests } from "@/server/sqlite/schema";

type QuestDifficulty = "easy" | "normal" | "hard" | "nightmare" | "hell";
export type QuestStatus = "open" | "in_progress" | "blocked" | "done";

function normalizeArea(value: string | undefined | null) {
  const trimmed = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return trimmed || null;
}

export interface QuestRow {
  id: string;
  userId: string;
  projectId: string;
  goal: string;
  difficulty: string;
  status: QuestStatus;
  area: string | null;
  topics: string[];
  completed: boolean;
  date: string;
  completedDate: string | null;
}

const QUEST_LIST_CACHE_TTL_MS = 10000;
const questListCache = new Map<
  string,
  {
    expiresAt: number;
    quests: QuestRow[];
  }
>();

function questListCacheKey(
  userId: string,
  projectId: string,
  opts: {
    limit?: number;
    skip?: number;
    completed?: boolean;
    status?: QuestStatus;
    area?: string;
  },
) {
  return JSON.stringify({
    userId,
    projectId,
    limit: opts.limit ?? 1000,
    skip: opts.skip ?? 0,
    completed: typeof opts.completed === "boolean" ? opts.completed : null,
    status: opts.status ?? null,
    area: normalizeArea(opts.area),
  });
}

function toQuestRow(raw: typeof quests.$inferSelect): QuestRow {
  const storedTopics = normalizeTopics(parseJsonField(raw.topicsJson));

  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    goal: raw.goal,
    difficulty: raw.difficulty,
    status: (raw.status as QuestStatus) || (raw.completed ? "done" : "open"),
    area: raw.area || null,
    topics:
      storedTopics.length > 0
        ? storedTopics
        : inferWorkItemTopics({ goal: raw.goal, area: raw.area || null, topics: storedTopics }),
    completed: raw.completed,
    date: raw.date,
    completedDate: raw.completedDate,
  };
}

export function listQuests(
  userId: string,
  projectId: string,
  opts: {
    limit?: number;
    skip?: number;
    completed?: boolean;
    status?: QuestStatus;
    area?: string;
  } = {},
): QuestRow[] {
  const cacheKey = questListCacheKey(userId, projectId, opts);
  const cached = questListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.quests;
  }

  const limit = opts.limit ?? 1000;
  const offset = opts.skip ?? 0;
  const now = new Date().toISOString();
  const conditions = [
    eq(quests.userId, userId),
    eq(quests.projectId, projectId),
    lte(quests.date, now),
  ];

  if (typeof opts.completed === "boolean") {
    conditions.push(eq(quests.completed, opts.completed));
  }
  if (opts.status) {
    conditions.push(eq(quests.status, opts.status));
  }
  const normalizedArea = normalizeArea(opts.area);
  if (normalizedArea) {
    conditions.push(eq(quests.area, normalizedArea));
  }

  const questRows = db
    .select()
    .from(quests)
    .where(and(...conditions))
    .orderBy(desc(quests.date))
    .limit(limit)
    .offset(offset)
    .all()
    .map(toQuestRow);

  questListCache.set(cacheKey, {
    expiresAt: Date.now() + QUEST_LIST_CACHE_TTL_MS,
    quests: questRows,
  });

  return questRows;
}

export function clearQuestListCache(userId?: string, projectId?: string) {
  if (!userId || !projectId) {
    questListCache.clear();
    return;
  }

  const prefix = `{"userId":"${userId}","projectId":"${projectId}"`;
  for (const key of questListCache.keys()) {
    if (key.startsWith(prefix)) {
      questListCache.delete(key);
    }
  }
}

export function findQuestById(
  userId: string,
  projectId: string,
  id: string,
): QuestRow | undefined {
  const row = db
    .select()
    .from(quests)
    .where(
      and(
        eq(quests.id, id),
        eq(quests.userId, userId),
        eq(quests.projectId, projectId),
      ),
    )
    .get();

  return row ? toQuestRow(row) : undefined;
}

export function countQuests(userId: string, projectId: string): number {
  return countQuestsWithFilter(userId, projectId);
}

export function countQuestsWithFilter(
  userId: string,
  projectId: string,
  filter: { completed?: boolean; status?: QuestStatus; area?: string } = {},
): number {
  const conditions = [
    eq(quests.userId, userId),
    eq(quests.projectId, projectId),
  ];
  if (typeof filter.completed === "boolean") {
    conditions.push(eq(quests.completed, filter.completed));
  }
  if (filter.status) {
    conditions.push(eq(quests.status, filter.status));
  }
  const normalizedArea = normalizeArea(filter.area);
  if (normalizedArea) {
    conditions.push(eq(quests.area, normalizedArea));
  }

  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(quests)
    .where(and(...conditions))
    .get();
  return row?.count ?? 0;
}

export function countOpenQuests(userId: string, projectId: string): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(quests)
    .where(
      and(
        eq(quests.userId, userId),
        eq(quests.projectId, projectId),
        eq(quests.completed, false),
      ),
    )
    .get();
  return row?.count ?? 0;
}

export function countCompletedQuests(userId: string, projectId: string): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(quests)
    .where(
      and(
        eq(quests.userId, userId),
        eq(quests.projectId, projectId),
        eq(quests.completed, true),
      ),
    )
    .get();
  return row?.count ?? 0;
}

export function createQuest(
  userId: string,
  projectId: string,
  goal: string,
  difficulty: QuestDifficulty = "normal",
  topics: string[] = [],
  status: QuestStatus = "open",
  area?: string,
): QuestRow {
  const id = randomUUID();
  const now = new Date().toISOString();
  const normalizedArea = normalizeArea(area);
  const normalizedTopics = inferWorkItemTopics({ goal, area: normalizedArea, topics });
  const normalizedStatus = status === "done" ? "done" : status;
  const completed = normalizedStatus === "done";

  db.insert(quests)
    .values({
      id,
      userId,
      projectId,
      goal: goal.slice(0, 100),
      difficulty,
      status: normalizedStatus,
      area: normalizedArea,
      topicsJson: stringifyJsonField(normalizedTopics),
      completed,
      date: now,
      completedDate: completed ? now : null,
    })
    .run();

  clearQuestListCache(userId, projectId);

  return {
    id,
    userId,
    projectId,
    goal: goal.slice(0, 100),
    difficulty,
    status: normalizedStatus,
    area: normalizedArea,
    topics: normalizedTopics,
    completed,
    date: now,
    completedDate: completed ? now : null,
  };
}

export function updateQuest(
  userId: string,
  projectId: string,
  id: string,
  data: {
    goal?: string;
    difficulty?: QuestDifficulty;
    topics?: string[];
    status?: QuestStatus;
    area?: string | null;
  },
): QuestRow | null {
  const existing = findQuestById(userId, projectId, id);
  if (!existing) return null;

  const updated: Record<string, unknown> = {};
  if (data.goal !== undefined) updated.goal = data.goal;
  if (data.difficulty !== undefined) updated.difficulty = data.difficulty;
  const nextStatus = data.status ?? existing.status;
  const nextCompleted = nextStatus === "done";
  if (data.status !== undefined) {
    updated.status = nextStatus;
    updated.completed = nextCompleted;
    updated.completedDate = nextCompleted ? existing.completedDate || new Date().toISOString() : null;
  }
  if (data.area !== undefined) {
    updated.area = normalizeArea(data.area);
  }
  if (data.topics !== undefined) {
    updated.topicsJson = stringifyJsonField(normalizeTopics(data.topics));
  }

  if (Object.keys(updated).length === 0) return existing;

  db.update(quests)
    .set(updated)
    .where(
      and(
        eq(quests.id, id),
        eq(quests.userId, userId),
        eq(quests.projectId, projectId),
      ),
    )
    .run();

  clearQuestListCache(userId, projectId);

  return {
    ...existing,
    goal: data.goal ?? existing.goal,
    difficulty: data.difficulty ?? existing.difficulty,
    status: nextStatus,
    area: data.area !== undefined ? normalizeArea(data.area) : existing.area,
    topics: data.topics !== undefined ? normalizeTopics(data.topics) : existing.topics,
    completed: nextCompleted,
    completedDate:
      data.status !== undefined
        ? nextCompleted
          ? existing.completedDate || new Date().toISOString()
          : null
        : existing.completedDate,
  };
}

export function toggleQuestCompletion(
  userId: string,
  projectId: string,
  id: string,
): QuestRow | null {
  const existing = findQuestById(userId, projectId, id);
  if (!existing) return null;

  const nextCompleted = !existing.completed;
  const completedDate = nextCompleted ? new Date().toISOString() : null;
  const nextStatus: QuestStatus = nextCompleted ? "done" : "open";

  db.update(quests)
    .set({ completed: nextCompleted, completedDate, status: nextStatus })
    .where(
      and(
        eq(quests.id, id),
        eq(quests.userId, userId),
        eq(quests.projectId, projectId),
      ),
    )
    .run();

  clearQuestListCache(userId, projectId);

  return { ...existing, status: nextStatus, completed: nextCompleted, completedDate };
}

export function deleteQuest(userId: string, projectId: string, id: string): boolean {
  const result = db
    .delete(quests)
    .where(
      and(
        eq(quests.id, id),
        eq(quests.userId, userId),
        eq(quests.projectId, projectId),
      ),
    )
    .run();
  if (result.changes > 0) {
    clearQuestListCache(userId, projectId);
  }
  return result.changes > 0;
}
