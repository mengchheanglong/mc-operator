import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/server/sqlite/db";
import { notes } from "@/server/sqlite/schema";

export interface NoteRow {
  id: string;
  userId: string;
  projectId: string;
  content: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

const NOTE_LIST_CACHE_TTL_MS = 10000;
const noteListCache = new Map<
  string,
  {
    expiresAt: number;
    notes: NoteRow[];
  }
>();

export function listNotes(userId: string, projectId: string): NoteRow[] {
  const cacheKey = `${userId}:${projectId}`;
  const cached = noteListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.notes;
  }

  const rows = db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.projectId, projectId)))
    .orderBy(desc(notes.updatedAt))
    .all();

  noteListCache.set(cacheKey, {
    expiresAt: Date.now() + NOTE_LIST_CACHE_TTL_MS,
    notes: rows,
  });

  return rows;
}

export function clearNoteListCache(userId?: string, projectId?: string) {
  if (!userId || !projectId) {
    noteListCache.clear();
    return;
  }

  noteListCache.delete(`${userId}:${projectId}`);
}

export function findNoteById(
  userId: string,
  projectId: string,
  id: string,
): NoteRow | undefined {
  return db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.id, id),
        eq(notes.userId, userId),
        eq(notes.projectId, projectId),
      ),
    )
    .get();
}

export function countNotes(userId: string, projectId: string): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.projectId, projectId)))
    .get();
  return row?.count ?? 0;
}

export function countPendingNotes(userId: string, projectId: string): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.projectId, projectId),
        eq(notes.completed, false),
      ),
    )
    .get();
  return row?.count ?? 0;
}

export function createNote(userId: string, projectId: string, content: string): NoteRow {
  const now = new Date().toISOString();
  const id = randomUUID();

  db.insert(notes)
    .values({
      id,
      userId,
      projectId,
      content,
      completed: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  clearNoteListCache(userId, projectId);

  return {
    id,
    userId,
    projectId,
    content,
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateNote(
  userId: string,
  projectId: string,
  id: string,
  data: { content?: string; completed?: boolean },
): NoteRow | null {
  const existing = findNoteById(userId, projectId, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = {
    content: data.content ?? existing.content,
    completed: data.completed ?? existing.completed,
    updatedAt: now,
  };

  db.update(notes)
    .set(updated)
    .where(
      and(
        eq(notes.id, id),
        eq(notes.userId, userId),
        eq(notes.projectId, projectId),
      ),
    )
    .run();

  clearNoteListCache(userId, projectId);

  return { ...existing, ...updated };
}

export function deleteNote(userId: string, projectId: string, id: string): boolean {
  const result = db
    .delete(notes)
    .where(
      and(
        eq(notes.id, id),
        eq(notes.userId, userId),
        eq(notes.projectId, projectId),
      ),
    )
    .run();
  if (result.changes > 0) {
    clearNoteListCache(userId, projectId);
  }
  return result.changes > 0;
}
