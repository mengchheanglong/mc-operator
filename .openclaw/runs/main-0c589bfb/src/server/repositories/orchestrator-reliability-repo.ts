import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/server/sqlite/db";
import { orchestratorReliabilityStats } from "@/server/sqlite/schema";

interface ReliabilityRow {
  id: string;
  userId: string;
  projectId: string;
  createTotal: number;
  createSuccess: number;
  dispatchTotal: number;
  dispatchSuccess: number;
  closeTotal: number;
  closeSuccess: number;
  overlapBlockCount: number;
  staleCleanupCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReliabilitySummary extends ReliabilityRow {
  createSuccessRate: number;
  dispatchSuccessRate: number;
  closeSuccessRate: number;
}

function toSummary(row: ReliabilityRow): ReliabilitySummary {
  const rate = (ok: number, total: number) => (total <= 0 ? 1 : Number((ok / total).toFixed(4)));
  return {
    ...row,
    createSuccessRate: rate(row.createSuccess, row.createTotal),
    dispatchSuccessRate: rate(row.dispatchSuccess, row.dispatchTotal),
    closeSuccessRate: rate(row.closeSuccess, row.closeTotal),
  };
}

function ensureRow(userId: string, projectId: string) {
  const found = db
    .select()
    .from(orchestratorReliabilityStats)
    .where(and(eq(orchestratorReliabilityStats.userId, userId), eq(orchestratorReliabilityStats.projectId, projectId)))
    .get();
  if (found) return found;

  const now = new Date().toISOString();
  const created = {
    id: randomUUID(),
    userId,
    projectId,
    createTotal: 0,
    createSuccess: 0,
    dispatchTotal: 0,
    dispatchSuccess: 0,
    closeTotal: 0,
    closeSuccess: 0,
    overlapBlockCount: 0,
    staleCleanupCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(orchestratorReliabilityStats).values(created).run();
  return created;
}

function update(userId: string, projectId: string, patch: Partial<ReliabilityRow>) {
  ensureRow(userId, projectId);
  db.update(orchestratorReliabilityStats)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(and(eq(orchestratorReliabilityStats.userId, userId), eq(orchestratorReliabilityStats.projectId, projectId)))
    .run();
}

export function getOrchestratorReliabilitySummary(userId: string, projectId: string): ReliabilitySummary {
  ensureRow(userId, projectId);
  const row = db
    .select()
    .from(orchestratorReliabilityStats)
    .where(and(eq(orchestratorReliabilityStats.userId, userId), eq(orchestratorReliabilityStats.projectId, projectId)))
    .get() as ReliabilityRow;
  return toSummary(row);
}

export function recordCreateOutcome(userId: string, projectId: string, success: boolean) {
  const row = ensureRow(userId, projectId) as ReliabilityRow;
  update(userId, projectId, {
    createTotal: row.createTotal + 1,
    createSuccess: row.createSuccess + (success ? 1 : 0),
  });
}

export function recordDispatchOutcome(userId: string, projectId: string, success: boolean) {
  const row = ensureRow(userId, projectId) as ReliabilityRow;
  update(userId, projectId, {
    dispatchTotal: row.dispatchTotal + 1,
    dispatchSuccess: row.dispatchSuccess + (success ? 1 : 0),
  });
}

export function recordCloseOutcome(userId: string, projectId: string, success: boolean, reason?: string) {
  const row = ensureRow(userId, projectId) as ReliabilityRow;
  update(userId, projectId, {
    closeTotal: row.closeTotal + 1,
    closeSuccess: row.closeSuccess + (success ? 1 : 0),
    staleCleanupCount: row.staleCleanupCount + (success && reason === "stale" ? 1 : 0),
  });
}

export function recordOverlapBlock(userId: string, projectId: string) {
  const row = ensureRow(userId, projectId) as ReliabilityRow;
  update(userId, projectId, { overlapBlockCount: row.overlapBlockCount + 1 });
}
