import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/server/sqlite/db";
import { parseJsonField, stringifyJsonField } from "@/server/sqlite/json";
import { reports } from "@/server/sqlite/schema";

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
  source: string;
  metadata: Record<string, unknown>;
  date: string;
}

function toReportRow(raw: typeof reports.$inferSelect): ReportRow {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    title: raw.title,
    content: raw.content,
    category: raw.category as ReportCategory,
    status: raw.status as ReportStatus,
    source: raw.source,
    metadata: parseJsonField(raw.metadataJson),
    date: raw.date,
  };
}

export function listReports(
  userId: string,
  projectId: string,
  opts: {
    category?: ReportCategory;
    status?: ReportStatus;
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
  filter?: { status?: ReportStatus; category?: ReportCategory },
): number {
  const conditions = [
    eq(reports.userId, userId),
    eq(reports.projectId, projectId),
  ];
  if (filter?.status) conditions.push(eq(reports.status, filter.status));
  if (filter?.category) conditions.push(eq(reports.category, filter.category));

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
    source?: string;
    metadata?: Record<string, unknown>;
  },
): ReportRow {
  const id = randomUUID();
  const now = new Date().toISOString();

  const row = {
    id,
    userId,
    projectId,
    title: data.title,
    content: data.content,
    category: data.category || "system",
    status: data.status || "info",
    source: data.source || "OpenClaw",
    metadataJson: stringifyJsonField(data.metadata),
    date: now,
  };

  db.insert(reports).values(row).run();

  return toReportRow(row);
}

export function deleteReport(userId: string, projectId: string, id: string): boolean {
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
  return result.changes > 0;
}
