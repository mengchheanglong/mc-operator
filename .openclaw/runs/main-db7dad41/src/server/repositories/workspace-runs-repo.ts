import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/server/sqlite/db";
import { parseJsonField, stringifyJsonField } from "@/server/sqlite/json";
import { workspaceRuns } from "@/server/sqlite/schema";

export type WorkspaceRunStatus = "active" | "closed" | "archived" | "error";

export interface WorkspaceRunRow {
  id: string;
  userId: string;
  projectId: string;
  branch: string;
  worktreePath: string;
  status: WorkspaceRunStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  closedAt: string | null;
}

function toRow(raw: typeof workspaceRuns.$inferSelect): WorkspaceRunRow {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    branch: raw.branch,
    worktreePath: raw.worktreePath,
    status: (raw.status as WorkspaceRunStatus) || "active",
    metadata: parseJsonField(raw.metadataJson) as Record<string, unknown>,
    createdAt: raw.createdAt,
    closedAt: raw.closedAt || null,
  };
}

export function createWorkspaceRun(input: {
  userId: string;
  projectId: string;
  branch: string;
  worktreePath: string;
  status?: WorkspaceRunStatus;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    branch: input.branch.trim(),
    worktreePath: input.worktreePath,
    status: input.status || "active",
    metadataJson: stringifyJsonField(input.metadata || {}),
    createdAt: now,
    closedAt: input.status && input.status !== "active" ? now : null,
  };

  db.insert(workspaceRuns).values(row).run();
  return toRow(row);
}

export function listWorkspaceRuns(userId: string, projectId: string, limit = 50) {
  return db
    .select()
    .from(workspaceRuns)
    .where(and(eq(workspaceRuns.userId, userId), eq(workspaceRuns.projectId, projectId)))
    .orderBy(desc(workspaceRuns.createdAt))
    .limit(limit)
    .all()
    .map(toRow);
}

export function findWorkspaceRunById(userId: string, projectId: string, id: string) {
  const row = db
    .select()
    .from(workspaceRuns)
    .where(and(eq(workspaceRuns.userId, userId), eq(workspaceRuns.projectId, projectId), eq(workspaceRuns.id, id)))
    .get();

  return row ? toRow(row) : null;
}

export function findActiveWorkspaceRunByBranch(userId: string, projectId: string, branch: string) {
  const row = db
    .select()
    .from(workspaceRuns)
    .where(
      and(
        eq(workspaceRuns.userId, userId),
        eq(workspaceRuns.projectId, projectId),
        eq(workspaceRuns.branch, branch),
        eq(workspaceRuns.status, "active"),
      ),
    )
    .get();

  return row ? toRow(row) : null;
}

export function updateWorkspaceRun(
  userId: string,
  projectId: string,
  id: string,
  updates: {
    status?: WorkspaceRunStatus;
    metadata?: Record<string, unknown>;
    closedAt?: string | null;
    worktreePath?: string;
  },
) {
  const setData: Record<string, unknown> = {};
  if (updates.status !== undefined) {
    setData.status = updates.status;
  }
  if (updates.metadata !== undefined) {
    setData.metadataJson = stringifyJsonField(updates.metadata);
  }
  if (updates.closedAt !== undefined) {
    setData.closedAt = updates.closedAt;
  }
  if (updates.worktreePath !== undefined) {
    setData.worktreePath = updates.worktreePath;
  }

  if (Object.keys(setData).length === 0) {
    return findWorkspaceRunById(userId, projectId, id);
  }

  db.update(workspaceRuns)
    .set(setData)
    .where(and(eq(workspaceRuns.userId, userId), eq(workspaceRuns.projectId, projectId), eq(workspaceRuns.id, id)))
    .run();

  return findWorkspaceRunById(userId, projectId, id);
}
