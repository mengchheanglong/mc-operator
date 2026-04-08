import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/server/sqlite/db";
import { parseJsonField, stringifyJsonField } from "@/server/sqlite/json";
import { automationTemplateRuns } from "@/server/sqlite/schema";

export type TemplateRunMode = "prepare" | "execute" | "evaluate";
export type TemplateRunStatus = "queued" | "dispatched" | "success" | "warning" | "error";

export interface AutomationTemplateRunRow {
  id: string;
  userId: string;
  projectId: string;
  templateId: string;
  mode: TemplateRunMode;
  status: TemplateRunStatus;
  summary: string | null;
  idempotencyKey: string | null;
  targetUrl: string | null;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

function toRow(raw: typeof automationTemplateRuns.$inferSelect): AutomationTemplateRunRow {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    templateId: raw.templateId,
    mode: (raw.mode as TemplateRunMode) || "execute",
    status: (raw.status as TemplateRunStatus) || "queued",
    summary: raw.summary || null,
    idempotencyKey: raw.idempotencyKey || null,
    targetUrl: raw.targetUrl || null,
    request: parseJsonField(raw.requestJson) as Record<string, unknown>,
    response: parseJsonField(raw.responseJson) as Record<string, unknown>,
    errorMessage: raw.errorMessage || null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    completedAt: raw.completedAt || null,
  };
}

export function createTemplateRun(input: {
  userId: string;
  projectId: string;
  templateId: string;
  mode: TemplateRunMode;
  status: TemplateRunStatus;
  summary?: string;
  idempotencyKey?: string;
  targetUrl?: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  errorMessage?: string;
}) {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    templateId: input.templateId,
    mode: input.mode,
    status: input.status,
    summary: input.summary?.trim().slice(0, 240) || null,
    idempotencyKey: input.idempotencyKey || null,
    targetUrl: input.targetUrl || null,
    requestJson: stringifyJsonField(input.request || {}),
    responseJson: stringifyJsonField(input.response || {}),
    errorMessage: input.errorMessage?.slice(0, 2000) || null,
    createdAt: now,
    updatedAt: now,
    completedAt: ["success", "warning", "error", "dispatched"].includes(input.status)
      ? now
      : null,
  };

  db.insert(automationTemplateRuns).values(row).run();
  return toRow(row);
}

export function updateTemplateRun(
  userId: string,
  projectId: string,
  id: string,
  updates: {
    status?: TemplateRunStatus;
    summary?: string;
    response?: Record<string, unknown>;
    errorMessage?: string;
  },
) {
  const now = new Date().toISOString();
  const setData: Record<string, unknown> = { updatedAt: now };

  if (updates.status !== undefined) {
    setData.status = updates.status;
    if (["success", "warning", "error", "dispatched"].includes(updates.status)) {
      setData.completedAt = now;
    }
  }
  if (updates.summary !== undefined) setData.summary = updates.summary.trim().slice(0, 240);
  if (updates.response !== undefined) setData.responseJson = stringifyJsonField(updates.response);
  if (updates.errorMessage !== undefined) setData.errorMessage = updates.errorMessage.slice(0, 2000);

  db.update(automationTemplateRuns)
    .set(setData)
    .where(
      and(
        eq(automationTemplateRuns.id, id),
        eq(automationTemplateRuns.userId, userId),
        eq(automationTemplateRuns.projectId, projectId),
      ),
    )
    .run();

  const row = db
    .select()
    .from(automationTemplateRuns)
    .where(
      and(
        eq(automationTemplateRuns.id, id),
        eq(automationTemplateRuns.userId, userId),
        eq(automationTemplateRuns.projectId, projectId),
      ),
    )
    .get();

  return row ? toRow(row) : null;
}

export function listTemplateRuns(userId: string, projectId: string, templateId: string, limit = 20) {
  return db
    .select()
    .from(automationTemplateRuns)
    .where(
      and(
        eq(automationTemplateRuns.userId, userId),
        eq(automationTemplateRuns.projectId, projectId),
        eq(automationTemplateRuns.templateId, templateId),
      ),
    )
    .orderBy(desc(automationTemplateRuns.createdAt))
    .limit(limit)
    .all()
    .map(toRow);
}
