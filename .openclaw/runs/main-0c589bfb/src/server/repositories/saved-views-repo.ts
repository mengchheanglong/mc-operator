import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/server/sqlite/db";
import { parseJsonField, stringifyJsonField } from "@/server/sqlite/json";
import { savedViews } from "@/server/sqlite/schema";

export type SavedViewSurface = "quests" | "reports";

export interface SavedViewRow<TFilters = Record<string, unknown>> {
  id: string;
  userId: string;
  projectId: string;
  surface: SavedViewSurface;
  name: string;
  filters: TFilters;
  createdAt: string;
  updatedAt: string;
}

function toSavedViewRow<TFilters>(
  raw: typeof savedViews.$inferSelect,
): SavedViewRow<TFilters> {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    surface: raw.surface as SavedViewSurface,
    name: raw.name,
    filters: parseJsonField(raw.filtersJson) as TFilters,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function listSavedViews<TFilters = Record<string, unknown>>(
  userId: string,
  projectId: string,
  surface: SavedViewSurface,
) {
  return db
    .select()
    .from(savedViews)
    .where(
      and(
        eq(savedViews.userId, userId),
        eq(savedViews.projectId, projectId),
        eq(savedViews.surface, surface),
      ),
    )
    .orderBy(desc(savedViews.updatedAt))
    .all()
    .map((row) => toSavedViewRow<TFilters>(row));
}

export function createSavedView<TFilters = Record<string, unknown>>(
  userId: string,
  projectId: string,
  surface: SavedViewSurface,
  name: string,
  filters: TFilters,
) {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(savedViews)
    .values({
      id,
      userId,
      projectId,
      surface,
      name: name.trim().slice(0, 80),
      filtersJson: stringifyJsonField(filters),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    userId,
    projectId,
    surface,
    name: name.trim().slice(0, 80),
    filters,
    createdAt: now,
    updatedAt: now,
  } satisfies SavedViewRow<TFilters>;
}

export function deleteSavedView(
  userId: string,
  projectId: string,
  id: string,
) {
  const result = db
    .delete(savedViews)
    .where(
      and(
        eq(savedViews.id, id),
        eq(savedViews.userId, userId),
        eq(savedViews.projectId, projectId),
      ),
    )
    .run();

  return result.changes > 0;
}
