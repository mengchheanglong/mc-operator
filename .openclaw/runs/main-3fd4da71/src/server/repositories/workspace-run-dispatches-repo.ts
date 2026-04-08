import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/server/sqlite/db";
import { parseJsonField, stringifyJsonField } from "@/server/sqlite/json";
import { workspaceRunDispatches } from "@/server/sqlite/schema";

export type WorkspaceRunDispatchStatus = "running" | "accepted" | "success" | "error";

export interface WorkspaceRunDispatchRow {
  id: string;
  userId: string;
  projectId: string;
  runId: string;
  agentId: string;
  sessionId: string | null;
  model: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: WorkspaceRunDispatchStatus;
  failureClass: string | null;
  command: string | null;
  reportId: string | null;
  artifactPath: string | null;
  metadata: Record<string, unknown>;
}

function toRow(raw: typeof workspaceRunDispatches.$inferSelect): WorkspaceRunDispatchRow {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    runId: raw.runId,
    agentId: raw.agentId,
    sessionId: raw.sessionId || null,
    model: raw.model || null,
    startedAt: raw.startedAt,
    finishedAt: raw.finishedAt || null,
    status: (raw.status as WorkspaceRunDispatchStatus) || "running",
    failureClass: raw.failureClass || null,
    command: raw.command || null,
    reportId: raw.reportId || null,
    artifactPath: raw.artifactPath || null,
    metadata: parseJsonField(raw.metadataJson) as Record<string, unknown>,
  };
}

export function createWorkspaceRunDispatch(input: {
  userId: string;
  projectId: string;
  runId: string;
  agentId: string;
  sessionId?: string | null;
  model?: string | null;
  status?: WorkspaceRunDispatchStatus;
  failureClass?: string | null;
  command?: string | null;
  artifactPath?: string | null;
  reportId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    runId: input.runId,
    agentId: input.agentId,
    sessionId: input.sessionId || null,
    model: input.model || null,
    startedAt: now,
    finishedAt: input.status && input.status !== "running" ? now : null,
    status: input.status || "running",
    failureClass: input.failureClass || null,
    command: input.command || null,
    reportId: input.reportId || null,
    artifactPath: input.artifactPath || null,
    metadataJson: stringifyJsonField(input.metadata || {}),
  };
  db.insert(workspaceRunDispatches).values(row).run();
  return toRow(row);
}

export function updateWorkspaceRunDispatch(
  userId: string,
  projectId: string,
  id: string,
  updates: {
    sessionId?: string | null;
    model?: string | null;
    finishedAt?: string | null;
    status?: WorkspaceRunDispatchStatus;
    failureClass?: string | null;
    command?: string | null;
    reportId?: string | null;
    artifactPath?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const setData: Record<string, unknown> = {};
  if (updates.sessionId !== undefined) setData.sessionId = updates.sessionId;
  if (updates.model !== undefined) setData.model = updates.model;
  if (updates.finishedAt !== undefined) setData.finishedAt = updates.finishedAt;
  if (updates.status !== undefined) setData.status = updates.status;
  if (updates.failureClass !== undefined) setData.failureClass = updates.failureClass;
  if (updates.command !== undefined) setData.command = updates.command;
  if (updates.reportId !== undefined) setData.reportId = updates.reportId;
  if (updates.artifactPath !== undefined) setData.artifactPath = updates.artifactPath;
  if (updates.metadata !== undefined) setData.metadataJson = stringifyJsonField(updates.metadata);

  db.update(workspaceRunDispatches)
    .set(setData)
    .where(and(eq(workspaceRunDispatches.userId, userId), eq(workspaceRunDispatches.projectId, projectId), eq(workspaceRunDispatches.id, id)))
    .run();

  const row = db.select().from(workspaceRunDispatches)
    .where(and(eq(workspaceRunDispatches.userId, userId), eq(workspaceRunDispatches.projectId, projectId), eq(workspaceRunDispatches.id, id))).get();
  return row ? toRow(row) : null;
}

export function findLatestWorkspaceRunDispatch(userId: string, projectId: string, runId: string) {
  const row = db.select().from(workspaceRunDispatches)
    .where(and(eq(workspaceRunDispatches.userId, userId), eq(workspaceRunDispatches.projectId, projectId), eq(workspaceRunDispatches.runId, runId)))
    .orderBy(desc(workspaceRunDispatches.startedAt)).get();
  return row ? toRow(row) : null;
}

export function hasRunningWorkspaceRunDispatch(userId: string, projectId: string, runId: string) {
  const row = db.select({ id: workspaceRunDispatches.id }).from(workspaceRunDispatches)
    .where(and(
      eq(workspaceRunDispatches.userId, userId),
      eq(workspaceRunDispatches.projectId, projectId),
      eq(workspaceRunDispatches.runId, runId),
      eq(workspaceRunDispatches.status, "running"),
    )).get();
  return Boolean(row?.id);
}
