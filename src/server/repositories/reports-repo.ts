import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { normalizeTopics } from "@/lib/topics";
import { db } from "@/server/sqlite/db";
import { parseJsonField, stringifyJsonField } from "@/server/sqlite/json";
import { reports } from "@/server/sqlite/schema";
import { syncDailyReportLogForDate } from "@/server/services/daily-report-log-service";

export type ReportCategory =
  | "system"
  | "task"
  | "chat"
  | "file"
  | "research"
  | "error"
  | "maintenance";

export type ReportStatus = "info" | "success" | "warning" | "error";

export interface ReportRow {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  content: string;
  category: ReportCategory;
  status: ReportStatus;
  area: string | null;
  linkedQuestId: string | null;
  source: string;
  topics: string[];
  metadata: Record<string, unknown>;
  date: string;
}

function normalizeArea(value: string | undefined | null) {
  const trimmed = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return trimmed || null;
}

function toReportRow(raw: typeof reports.$inferSelect): ReportRow {
  const metadata = parseJsonField(raw.metadataJson);

  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    title: raw.title,
    content: raw.content,
    category: raw.category as ReportCategory,
    status: raw.status as ReportStatus,
    area: raw.area || null,
    linkedQuestId: raw.linkedQuestId || null,
    source: raw.source,
    topics: normalizeTopics((metadata as { topics?: unknown }).topics),
    metadata,
    date: raw.date,
  };
}

export function listReports(
  userId: string,
  projectId: string,
  opts: {
    category?: ReportCategory;
    status?: ReportStatus;
    area?: string;
    linkedQuestId?: string;
    limit?: number;
    skip?: number;
  } = {},
): ReportRow[] {
  const limit = opts.limit ?? 50;
  const offset = opts.skip ?? 0;

  const conditions = [
    eq(reports.userId, userId),
    eq(reports.projectId, projectId),
  ];
  if (opts.category) conditions.push(eq(reports.category, opts.category));
  if (opts.status) conditions.push(eq(reports.status, opts.status));
  const normalizedArea = normalizeArea(opts.area);
  if (normalizedArea) conditions.push(eq(reports.area, normalizedArea));
  if (opts.linkedQuestId) conditions.push(eq(reports.linkedQuestId, opts.linkedQuestId));

  const rows = db
    .select()
    .from(reports)
    .where(and(...conditions))
    .orderBy(desc(reports.date))
    .limit(limit)
    .offset(offset)
    .all();

  return rows.map(toReportRow);
}

export function findReportById(
  userId: string,
  projectId: string,
  id: string,
): ReportRow | undefined {
  const row = db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.id, id),
        eq(reports.userId, userId),
        eq(reports.projectId, projectId),
      ),
    )
    .get();
  return row ? toReportRow(row) : undefined;
}

export function countReports(
  userId: string,
  projectId: string,
  filter?: { status?: ReportStatus; category?: ReportCategory; area?: string; linkedQuestId?: string },
): number {
  const conditions = [
    eq(reports.userId, userId),
    eq(reports.projectId, projectId),
  ];
  if (filter?.status) conditions.push(eq(reports.status, filter.status));
  if (filter?.category) conditions.push(eq(reports.category, filter.category));
  const normalizedArea = normalizeArea(filter?.area);
  if (normalizedArea) conditions.push(eq(reports.area, normalizedArea));
  if (filter?.linkedQuestId) conditions.push(eq(reports.linkedQuestId, filter.linkedQuestId));

  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(reports)
    .where(and(...conditions))
    .get();
  return row?.count ?? 0;
}

export function createReport(
  userId: string,
  projectId: string,
  data: {
    title: string;
    content: string;
    category?: ReportCategory;
    status?: ReportStatus;
    area?: string;
    linkedQuestId?: string;
    source?: string;
    topics?: string[];
    metadata?: Record<string, unknown>;
  },
): ReportRow {
  const id = randomUUID();
  const now = new Date().toISOString();
  const normalizedTopics = normalizeTopics(data.topics);
  const normalizedArea = normalizeArea(data.area);
  const metadata = {
    ...(data.metadata || {}),
    topics: normalizedTopics,
  };

  const row = {
    id,
    userId,
    projectId,
    title: data.title,
    content: data.content,
    category: data.category || "system",
    status: data.status || "info",
    area: normalizedArea,
    linkedQuestId: data.linkedQuestId || null,
    source: data.source || "OpenClaw",
    metadataJson: stringifyJsonField(metadata),
    date: now,
  };

  db.insert(reports).values(row).run();
  syncDailyReportLogForDate(userId, projectId, now);

  return toReportRow(row);
}

export function deleteReport(userId: string, projectId: string, id: string): boolean {
  const existing = findReportById(userId, projectId, id);
  const result = db
    .delete(reports)
    .where(
      and(
        eq(reports.id, id),
        eq(reports.userId, userId),
        eq(reports.projectId, projectId),
      ),
    )
    .run();
  if (result.changes > 0 && existing) {
    syncDailyReportLogForDate(userId, projectId, existing.date);
  }
  return result.changes > 0;
}
