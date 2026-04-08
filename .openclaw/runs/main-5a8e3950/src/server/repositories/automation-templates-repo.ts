import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { normalizeTopics } from "@/lib/topics";
import { db } from "@/server/sqlite/db";
import { parseJsonField, stringifyJsonField } from "@/server/sqlite/json";
import { automationTemplates } from "@/server/sqlite/schema";

export type AutomationExecutor = "codex" | "openclaw" | "n8n";
export type AutomationExecutionEnv = "worktree" | "local";
export type AutomationTemplateStatus = "active" | "paused";
export type AutomationRunStatus = "ready" | "queued" | "dispatched" | "success" | "warning" | "error";

export interface AutomationTemplateRow {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  prompt: string;
  executor: AutomationExecutor;
  executionEnv: AutomationExecutionEnv;
  webhookPath: string | null;
  status: AutomationTemplateStatus;
  area: string | null;
  topics: string[];
  lastRunAt: string | null;
  lastRunStatus: AutomationRunStatus | null;
  lastRunSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalizeArea(value: string | undefined | null) {
  const trimmed = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return trimmed || null;
}

function normalizeExecutor(value: string | undefined | null): AutomationExecutor {
  return value === "openclaw" || value === "n8n" ? value : "codex";
}

function normalizeExecutionEnv(value: string | undefined | null): AutomationExecutionEnv {
  return value === "local" ? "local" : "worktree";
}

function normalizeStatus(value: string | undefined | null): AutomationTemplateStatus {
  return value === "paused" ? "paused" : "active";
}

function normalizeWebhookPath(value: string | undefined | null) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function toRow(raw: typeof automationTemplates.$inferSelect): AutomationTemplateRow {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    name: raw.name,
    prompt: raw.prompt,
    executor: normalizeExecutor(raw.executor),
    executionEnv: normalizeExecutionEnv(raw.executionEnv),
    webhookPath: raw.webhookPath || null,
    status: normalizeStatus(raw.status),
    area: raw.area || null,
    topics: normalizeTopics(parseJsonField(raw.topicsJson)),
    lastRunAt: raw.lastRunAt || null,
    lastRunStatus: (raw.lastRunStatus as AutomationRunStatus | null) || null,
    lastRunSummary: raw.lastRunSummary || null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function listAutomationTemplates(userId: string, projectId: string) {
  return db
    .select()
    .from(automationTemplates)
    .where(
      and(
        eq(automationTemplates.userId, userId),
        eq(automationTemplates.projectId, projectId),
      ),
    )
    .orderBy(desc(automationTemplates.updatedAt))
    .all()
    .map(toRow);
}

export function findAutomationTemplateById(userId: string, projectId: string, id: string) {
  const row = db
    .select()
    .from(automationTemplates)
    .where(
      and(
        eq(automationTemplates.id, id),
        eq(automationTemplates.userId, userId),
        eq(automationTemplates.projectId, projectId),
      ),
    )
    .get();

  return row ? toRow(row) : undefined;
}

export function createAutomationTemplate(
  userId: string,
  projectId: string,
  data: {
    name: string;
    prompt: string;
    executor?: string;
    executionEnv?: string;
    status?: string;
    area?: string | null;
    webhookPath?: string | null;
    topics?: string[];
  },
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const executor = normalizeExecutor(data.executor);
  const webhookPath =
    normalizeWebhookPath(data.webhookPath) ||
    (executor === "n8n" ? "/webhook/mission-control/openclaw-router" : null);

  const row = {
    id,
    userId,
    projectId,
    name: data.name.trim().slice(0, 80),
    prompt: data.prompt.trim().slice(0, 4000),
    executor,
    executionEnv: normalizeExecutionEnv(data.executionEnv),
    status: normalizeStatus(data.status),
    area: normalizeArea(data.area),
    webhookPath,
    topicsJson: stringifyJsonField(normalizeTopics(data.topics || [])),
    lastRunAt: null,
    lastRunStatus: null,
    lastRunSummary: null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(automationTemplates).values(row).run();
  return toRow(row);
}

export function updateAutomationTemplate(
  userId: string,
  projectId: string,
  id: string,
  data: {
    name?: string;
    prompt?: string;
    executor?: string;
    executionEnv?: string;
    status?: string;
    area?: string | null;
    webhookPath?: string | null;
    topics?: string[];
  },
) {
  const existing = findAutomationTemplateById(userId, projectId, id);
  if (!existing) return null;

  const updated: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (data.name !== undefined) updated.name = data.name.trim().slice(0, 80);
  if (data.prompt !== undefined) updated.prompt = data.prompt.trim().slice(0, 4000);
  if (data.executor !== undefined) updated.executor = normalizeExecutor(data.executor);
  if (data.executionEnv !== undefined) updated.executionEnv = normalizeExecutionEnv(data.executionEnv);
  if (data.status !== undefined) updated.status = normalizeStatus(data.status);
  if (data.area !== undefined) updated.area = normalizeArea(data.area);
  if (data.webhookPath !== undefined) updated.webhookPath = normalizeWebhookPath(data.webhookPath);
  if (
    data.webhookPath === undefined &&
    normalizeExecutor(data.executor ?? existing.executor) === "n8n" &&
    !existing.webhookPath
  ) {
    updated.webhookPath = "/webhook/mission-control/openclaw-router";
  }
  if (data.topics !== undefined) updated.topicsJson = stringifyJsonField(normalizeTopics(data.topics));

  db.update(automationTemplates)
    .set(updated)
    .where(
      and(
        eq(automationTemplates.id, id),
        eq(automationTemplates.userId, userId),
        eq(automationTemplates.projectId, projectId),
      ),
    )
    .run();

  return findAutomationTemplateById(userId, projectId, id);
}

export function recordAutomationTemplateRun(
  userId: string,
  projectId: string,
  id: string,
  status: AutomationRunStatus,
  summary: string,
) {
  const now = new Date().toISOString();
  db.update(automationTemplates)
    .set({
      lastRunAt: now,
      lastRunStatus: status,
      lastRunSummary: summary.trim().slice(0, 240),
      updatedAt: now,
    })
    .where(
      and(
        eq(automationTemplates.id, id),
        eq(automationTemplates.userId, userId),
        eq(automationTemplates.projectId, projectId),
      ),
    )
    .run();

  return findAutomationTemplateById(userId, projectId, id);
}

export function deleteAutomationTemplate(userId: string, projectId: string, id: string) {
  const result = db
    .delete(automationTemplates)
    .where(
      and(
        eq(automationTemplates.id, id),
        eq(automationTemplates.userId, userId),
        eq(automationTemplates.projectId, projectId),
      ),
    )
    .run();

  return result.changes > 0;
}
