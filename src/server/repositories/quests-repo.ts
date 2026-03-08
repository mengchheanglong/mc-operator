import { and, desc, eq, lte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/server/sqlite/db";
import { quests } from "@/server/sqlite/schema";

type QuestDifficulty = "easy" | "normal" | "hard" | "nightmare" | "hell";

export interface QuestRow {
  id: string;
  userId: string;
  projectId: string;
  goal: string;
  difficulty: string;
  completed: boolean;
  date: string;
  completedDate: string | null;
}

export function listQuests(
  userId: string,
  projectId: string,
  opts: { limit?: number; skip?: number } = {},
): QuestRow[] {
  const limit = opts.limit ?? 1000;
  const offset = opts.skip ?? 0;
  const now = new Date().toISOString();

  return db
    .select()
    .from(quests)
    .where(
      and(
        eq(quests.userId, userId),
        eq(quests.projectId, projectId),
        lte(quests.date, now),
      ),
    )
    .orderBy(desc(quests.date))
    .limit(limit)
    .offset(offset)
    .all();
}

export function findQuestById(
  userId: string,
  projectId: string,
  id: string,
): QuestRow | undefined {
  return db
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
}

export function countQuests(userId: string, projectId: string): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(quests)
    .where(and(eq(quests.userId, userId), eq(quests.projectId, projectId)))
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
): QuestRow {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(quests)
    .values({
      id,
      userId,
      projectId,
      goal: goal.slice(0, 100),
      difficulty,
      completed: false,
      date: now,
      completedDate: null,
    })
    .run();

  return {
    id,
    userId,
    projectId,
    goal: goal.slice(0, 100),
    difficulty,
    completed: false,
    date: now,
    completedDate: null,
  };
}

export function updateQuest(
  userId: string,
  projectId: string,
  id: string,
  data: { goal?: string; difficulty?: QuestDifficulty },
): QuestRow | null {
  const existing = findQuestById(userId, projectId, id);
  if (!existing) return null;

  const updated: Record<string, unknown> = {};
  if (data.goal !== undefined) updated.goal = data.goal;
  if (data.difficulty !== undefined) updated.difficulty = data.difficulty;

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

  return { ...existing, ...updated } as QuestRow;
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

  db.update(quests)
    .set({ completed: nextCompleted, completedDate })
    .where(
      and(
        eq(quests.id, id),
        eq(quests.userId, userId),
        eq(quests.projectId, projectId),
      ),
    )
    .run();

  return { ...existing, completed: nextCompleted, completedDate };
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
  return result.changes > 0;
}
