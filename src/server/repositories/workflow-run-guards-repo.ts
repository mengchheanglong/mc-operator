import { and, eq } from "drizzle-orm";
import { db } from "@/server/sqlite/db";
import { workflowRunGuards } from "@/server/sqlite/schema";

export type WorkflowGuardScopeType = "agent" | "automation";

type CostRiskTier = "low" | "medium" | "high";

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export interface WorkflowRunGuardState {
  id: string;
  userId: string;
  projectId: string;
  scopeType: WorkflowGuardScopeType;
  scopeId: string;
  runSignature: string;
  repeatFailureCount: number;
  duplicateHitCount: number;
  reanalysisRequired: boolean;
  lastCostRiskTier: CostRiskTier;
  lastCostRiskLabel: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

function toRow(raw: typeof workflowRunGuards.$inferSelect): WorkflowRunGuardState {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    scopeType: raw.scopeType === "automation" ? "automation" : "agent",
    scopeId: raw.scopeId,
    runSignature: raw.runSignature,
    repeatFailureCount: Math.max(0, raw.repeatFailureCount || 0),
    duplicateHitCount: Math.max(0, raw.duplicateHitCount || 0),
    reanalysisRequired: Boolean(raw.reanalysisRequired),
    lastCostRiskTier:
      raw.lastCostRiskTier === "high" || raw.lastCostRiskTier === "medium" ? raw.lastCostRiskTier : "low",
    lastCostRiskLabel: String(raw.lastCostRiskLabel || "cost-risk/low"),
    lastSeenAt: raw.lastSeenAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function findState(userId: string, projectId: string, scopeType: WorkflowGuardScopeType, scopeId: string) {
  const row = db
    .select()
    .from(workflowRunGuards)
    .where(
      and(
        eq(workflowRunGuards.userId, userId),
        eq(workflowRunGuards.projectId, projectId),
        eq(workflowRunGuards.scopeType, scopeType),
        eq(workflowRunGuards.scopeId, scopeId),
      ),
    )
    .get();
  return row ? toRow(row) : null;
}

export function upsertWorkflowRunSignature(input: {
  userId: string;
  projectId: string;
  scopeType: WorkflowGuardScopeType;
  scopeId: string;
  runSignature: string;
  costRiskTier: CostRiskTier;
  costRiskLabel: string;
}) {
  const now = new Date().toISOString();
  const existing = findState(input.userId, input.projectId, input.scopeType, input.scopeId);

  if (!existing) {
    const row = {
      id: `${input.scopeType}:${input.scopeId}`,
      userId: input.userId,
      projectId: input.projectId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      runSignature: input.runSignature,
      repeatFailureCount: 0,
      duplicateHitCount: 0,
      reanalysisRequired: false,
      lastCostRiskTier: input.costRiskTier,
      lastCostRiskLabel: input.costRiskLabel,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    } as const;

    db.insert(workflowRunGuards).values(row).run();
    return {
      state: toRow(row),
      duplicateBlocked: false,
    };
  }

  const sameSignature = existing.runSignature === input.runSignature;
  const withinDuplicateWindow = Date.now() - new Date(existing.lastSeenAt).getTime() <= DUPLICATE_WINDOW_MS;
  const duplicateBlocked = sameSignature && withinDuplicateWindow;

  db.update(workflowRunGuards)
    .set({
      runSignature: input.runSignature,
      duplicateHitCount: duplicateBlocked ? existing.duplicateHitCount + 1 : existing.duplicateHitCount,
      lastCostRiskTier: input.costRiskTier,
      lastCostRiskLabel: input.costRiskLabel,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(workflowRunGuards.id, existing.id))
    .run();

  const next = findState(input.userId, input.projectId, input.scopeType, input.scopeId);
  return {
    state: next,
    duplicateBlocked,
  };
}

export function recordWorkflowRunOutcome(input: {
  userId: string;
  projectId: string;
  scopeType: WorkflowGuardScopeType;
  scopeId: string;
  outcome: "success" | "failure";
}) {
  const existing = findState(input.userId, input.projectId, input.scopeType, input.scopeId);
  if (!existing) return null;

  const repeatFailureCount = input.outcome === "failure" ? existing.repeatFailureCount + 1 : 0;
  const reanalysisRequired = repeatFailureCount >= 2;

  db.update(workflowRunGuards)
    .set({
      repeatFailureCount,
      reanalysisRequired,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowRunGuards.id, existing.id))
    .run();

  return findState(input.userId, input.projectId, input.scopeType, input.scopeId);
}

export function listWorkflowRunGuards(input: {
  userId: string;
  projectId: string;
  scopeType: WorkflowGuardScopeType;
}) {
  return db
    .select()
    .from(workflowRunGuards)
    .where(
      and(
        eq(workflowRunGuards.userId, input.userId),
        eq(workflowRunGuards.projectId, input.projectId),
        eq(workflowRunGuards.scopeType, input.scopeType),
      ),
    )
    .all()
    .map(toRow);
}
