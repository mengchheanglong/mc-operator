import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type {
  DirectiveCapabilityRecommendation,
  DirectiveCapabilitySourceType,
  DirectiveCapabilityStatus,
  DirectiveFrameworkStatus,
  DirectiveRuntimeStatus,
  DirectiveDecision,
  DirectiveEvaluationOutcome,
  DirectiveExperimentStatus,
  DirectiveIntegrationMode,
  DirectiveIntegrationStatus,
} from "@/lib/directive-workspace/v0";
import { db } from "@/server/sqlite/db";
import { parseJsonField, stringifyJsonField } from "@/server/sqlite/json";
import {
  directiveCapabilities,
  directiveDecisions,
  directiveEvaluations,
  directiveExperiments,
  directiveIntegrations,
} from "@/server/sqlite/schema";

export interface DirectiveCapabilityRow {
  id: string;
  userId: string;
  projectId: string;
  sourceType: DirectiveCapabilitySourceType;
  sourceRef: string;
  title: string;
  status: DirectiveCapabilityStatus;
  frameworkStatus: DirectiveFrameworkStatus;
  runtimeStatus: DirectiveRuntimeStatus;
  workflowFamily: string;
  userIntent: string | null;
  notes: string[];
  analysisSummary: string | null;
  category: string | null;
  problemFit: string | null;
  overlapNotes: string | null;
  riskNotes: string | null;
  recommendation: DirectiveCapabilityRecommendation | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DirectiveExperimentRow {
  id: string;
  userId: string;
  projectId: string;
  capabilityId: string;
  runId: string | null;
  hypothesis: string;
  plan: string;
  successCriteria: string[];
  status: DirectiveExperimentStatus;
  artifactPath: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DirectiveEvaluationRow {
  id: string;
  userId: string;
  projectId: string;
  capabilityId: string;
  experimentId: string;
  outcome: DirectiveEvaluationOutcome;
  usefulness: string | null;
  friction: string | null;
  workflowImpact: string | null;
  evidenceSummary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DirectiveDecisionRow {
  id: string;
  userId: string;
  projectId: string;
  capabilityId: string;
  evaluationId: string | null;
  decision: DirectiveDecision;
  rationale: string;
  decidedBy: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DirectiveIntegrationRow {
  id: string;
  userId: string;
  projectId: string;
  capabilityId: string;
  decisionId: string;
  status: DirectiveIntegrationStatus;
  integrationMode: DirectiveIntegrationMode;
  integrationSurface: string;
  targetRuntimeSurface: string | null;
  owner: string | null;
  dueAt: string | null;
  requiredGates: string[];
  proofArtifactPath: string | null;
  rollbackPlan: string | null;
  dependencyNotes: string | null;
  rollbackNotes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function toCapabilityRow(
  raw: typeof directiveCapabilities.$inferSelect,
): DirectiveCapabilityRow {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    sourceType: raw.sourceType as DirectiveCapabilitySourceType,
    sourceRef: raw.sourceRef,
    title: raw.title,
    status: raw.status as DirectiveCapabilityStatus,
    frameworkStatus:
      ((raw.frameworkStatus as DirectiveFrameworkStatus | null) ||
        (raw.status === "integrated"
          ? "decided"
          : (raw.status as DirectiveFrameworkStatus))) as DirectiveFrameworkStatus,
    runtimeStatus:
      ((raw.runtimeStatus as DirectiveRuntimeStatus | null) ||
        (raw.status === "integrated" ? "callable" : "none")) as DirectiveRuntimeStatus,
    workflowFamily: raw.workflowFamily,
    userIntent: raw.userIntent || null,
    notes: parseJsonField<string[]>(raw.notesJson),
    analysisSummary: raw.analysisSummary || null,
    category: raw.category || null,
    problemFit: raw.problemFit || null,
    overlapNotes: raw.overlapNotes || null,
    riskNotes: raw.riskNotes || null,
    recommendation:
      (raw.recommendation as DirectiveCapabilityRecommendation | null) || null,
    metadata: parseJsonField(raw.metadataJson),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function toExperimentRow(
  raw: typeof directiveExperiments.$inferSelect,
): DirectiveExperimentRow {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    capabilityId: raw.capabilityId,
    runId: raw.runId || null,
    hypothesis: raw.hypothesis,
    plan: raw.plan,
    successCriteria: parseJsonField<string[]>(raw.successCriteriaJson),
    status: raw.status as DirectiveExperimentStatus,
    artifactPath: raw.artifactPath || null,
    metadata: parseJsonField(raw.metadataJson),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    completedAt: raw.completedAt || null,
  };
}

function toEvaluationRow(
  raw: typeof directiveEvaluations.$inferSelect,
): DirectiveEvaluationRow {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    capabilityId: raw.capabilityId,
    experimentId: raw.experimentId,
    outcome: raw.outcome as DirectiveEvaluationOutcome,
    usefulness: raw.usefulness || null,
    friction: raw.friction || null,
    workflowImpact: raw.workflowImpact || null,
    evidenceSummary: raw.evidenceSummary,
    metadata: parseJsonField(raw.metadataJson),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function toDecisionRow(
  raw: typeof directiveDecisions.$inferSelect,
): DirectiveDecisionRow {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    capabilityId: raw.capabilityId,
    evaluationId: raw.evaluationId || null,
    decision: raw.decision as DirectiveDecision,
    rationale: raw.rationale,
    decidedBy: raw.decidedBy,
    metadata: parseJsonField(raw.metadataJson),
    createdAt: raw.createdAt,
  };
}

function toIntegrationRow(
  raw: typeof directiveIntegrations.$inferSelect,
): DirectiveIntegrationRow {
  return {
    id: raw.id,
    userId: raw.userId,
    projectId: raw.projectId,
    capabilityId: raw.capabilityId,
    decisionId: raw.decisionId,
    status: raw.status as DirectiveIntegrationStatus,
    integrationMode: raw.integrationMode as DirectiveIntegrationMode,
    integrationSurface: raw.integrationSurface,
    targetRuntimeSurface: raw.targetRuntimeSurface || null,
    owner: raw.owner || null,
    dueAt: raw.dueAt || null,
    requiredGates: parseJsonField<string[]>(raw.requiredGatesJson),
    proofArtifactPath: raw.proofArtifactPath || null,
    rollbackPlan: raw.rollbackPlan || null,
    dependencyNotes: raw.dependencyNotes || null,
    rollbackNotes: raw.rollbackNotes || null,
    metadata: parseJsonField(raw.metadataJson),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function createDirectiveCapability(input: {
  userId: string;
  projectId: string;
  sourceType: DirectiveCapabilitySourceType;
  sourceRef: string;
  title: string;
  status?: DirectiveCapabilityStatus;
  frameworkStatus?: DirectiveFrameworkStatus;
  runtimeStatus?: DirectiveRuntimeStatus;
  workflowFamily: string;
  userIntent?: string | null;
  notes?: string[];
  analysisSummary?: string | null;
  category?: string | null;
  problemFit?: string | null;
  overlapNotes?: string | null;
  riskNotes?: string | null;
  recommendation?: DirectiveCapabilityRecommendation | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    title: input.title,
    status: input.status || "intake",
    frameworkStatus: input.frameworkStatus || "intake",
    runtimeStatus: input.runtimeStatus || "none",
    workflowFamily: input.workflowFamily,
    userIntent: input.userIntent || null,
    notesJson: stringifyJsonField(input.notes || []),
    analysisSummary: input.analysisSummary || null,
    category: input.category || null,
    problemFit: input.problemFit || null,
    overlapNotes: input.overlapNotes || null,
    riskNotes: input.riskNotes || null,
    recommendation: input.recommendation || null,
    metadataJson: stringifyJsonField(input.metadata || {}),
    createdAt: now,
    updatedAt: now,
  };

  db.insert(directiveCapabilities).values(row).run();
  return toCapabilityRow(row);
}

export function listDirectiveCapabilities(
  userId: string,
  projectId: string,
  opts: { status?: DirectiveCapabilityStatus; limit?: number } = {},
) {
  const conditions = [
    eq(directiveCapabilities.userId, userId),
    eq(directiveCapabilities.projectId, projectId),
  ];
  if (opts.status) {
    conditions.push(eq(directiveCapabilities.status, opts.status));
  }

  return db
    .select()
    .from(directiveCapabilities)
    .where(and(...conditions))
    .orderBy(desc(directiveCapabilities.updatedAt), desc(directiveCapabilities.createdAt))
    .limit(opts.limit ?? 50)
    .all()
    .map(toCapabilityRow);
}

export function findDirectiveCapabilityById(
  userId: string,
  projectId: string,
  capabilityId: string,
) {
  const row = db
    .select()
    .from(directiveCapabilities)
    .where(
      and(
        eq(directiveCapabilities.userId, userId),
        eq(directiveCapabilities.projectId, projectId),
        eq(directiveCapabilities.id, capabilityId),
      ),
    )
    .get();

  return row ? toCapabilityRow(row) : null;
}

export function findDirectiveCapabilityBySourceRef(
  userId: string,
  projectId: string,
  sourceRef: string,
) {
  const row = db
    .select()
    .from(directiveCapabilities)
    .where(
      and(
        eq(directiveCapabilities.userId, userId),
        eq(directiveCapabilities.projectId, projectId),
        eq(directiveCapabilities.sourceRef, sourceRef),
      ),
    )
    .orderBy(desc(directiveCapabilities.updatedAt), desc(directiveCapabilities.createdAt))
    .get();
  return row ? toCapabilityRow(row) : null;
}

export function updateDirectiveCapability(
  userId: string,
  projectId: string,
  capabilityId: string,
  updates: {
    status?: DirectiveCapabilityStatus;
    frameworkStatus?: DirectiveFrameworkStatus;
    runtimeStatus?: DirectiveRuntimeStatus;
    title?: string;
    userIntent?: string | null;
    notes?: string[];
    analysisSummary?: string | null;
    category?: string | null;
    problemFit?: string | null;
    overlapNotes?: string | null;
    riskNotes?: string | null;
    recommendation?: DirectiveCapabilityRecommendation | null;
    metadata?: Record<string, unknown>;
  },
) {
  const setData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (updates.status !== undefined) setData.status = updates.status;
  if (updates.frameworkStatus !== undefined) setData.frameworkStatus = updates.frameworkStatus;
  if (updates.runtimeStatus !== undefined) setData.runtimeStatus = updates.runtimeStatus;
  if (updates.title !== undefined) setData.title = updates.title;
  if (updates.userIntent !== undefined) setData.userIntent = updates.userIntent || null;
  if (updates.notes !== undefined) setData.notesJson = stringifyJsonField(updates.notes);
  if (updates.analysisSummary !== undefined) setData.analysisSummary = updates.analysisSummary || null;
  if (updates.category !== undefined) setData.category = updates.category || null;
  if (updates.problemFit !== undefined) setData.problemFit = updates.problemFit || null;
  if (updates.overlapNotes !== undefined) setData.overlapNotes = updates.overlapNotes || null;
  if (updates.riskNotes !== undefined) setData.riskNotes = updates.riskNotes || null;
  if (updates.recommendation !== undefined) setData.recommendation = updates.recommendation || null;
  if (updates.metadata !== undefined) setData.metadataJson = stringifyJsonField(updates.metadata);

  db.update(directiveCapabilities)
    .set(setData)
    .where(
      and(
        eq(directiveCapabilities.userId, userId),
        eq(directiveCapabilities.projectId, projectId),
        eq(directiveCapabilities.id, capabilityId),
      ),
    )
    .run();

  return findDirectiveCapabilityById(userId, projectId, capabilityId);
}

export function createDirectiveExperiment(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
  runId?: string | null;
  hypothesis: string;
  plan: string;
  successCriteria?: string[];
  status?: DirectiveExperimentStatus;
  artifactPath?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    capabilityId: input.capabilityId,
    runId: input.runId || null,
    hypothesis: input.hypothesis,
    plan: input.plan,
    successCriteriaJson: stringifyJsonField(input.successCriteria || []),
    status: input.status || "proposed",
    artifactPath: input.artifactPath || null,
    metadataJson: stringifyJsonField(input.metadata || {}),
    createdAt: now,
    updatedAt: now,
    completedAt:
      input.status === "completed" || input.status === "aborted" ? now : null,
  };

  db.insert(directiveExperiments).values(row).run();
  return toExperimentRow(row);
}

export function listDirectiveExperimentsForCapability(
  userId: string,
  projectId: string,
  capabilityId: string,
) {
  return db
    .select()
    .from(directiveExperiments)
    .where(
      and(
        eq(directiveExperiments.userId, userId),
        eq(directiveExperiments.projectId, projectId),
        eq(directiveExperiments.capabilityId, capabilityId),
      ),
    )
    .orderBy(desc(directiveExperiments.createdAt))
    .all()
    .map(toExperimentRow);
}

export function findDirectiveExperimentById(
  userId: string,
  projectId: string,
  experimentId: string,
) {
  const row = db
    .select()
    .from(directiveExperiments)
    .where(
      and(
        eq(directiveExperiments.userId, userId),
        eq(directiveExperiments.projectId, projectId),
        eq(directiveExperiments.id, experimentId),
      ),
    )
    .get();
  return row ? toExperimentRow(row) : null;
}

export function updateDirectiveExperiment(
  userId: string,
  projectId: string,
  experimentId: string,
  updates: {
    status?: DirectiveExperimentStatus;
    runId?: string | null;
    artifactPath?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const setData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (updates.status !== undefined) {
    setData.status = updates.status;
    if (updates.status === "completed" || updates.status === "aborted") {
      setData.completedAt = new Date().toISOString();
    }
  }
  if (updates.runId !== undefined) setData.runId = updates.runId || null;
  if (updates.artifactPath !== undefined) setData.artifactPath = updates.artifactPath || null;
  if (updates.metadata !== undefined) setData.metadataJson = stringifyJsonField(updates.metadata);

  db.update(directiveExperiments)
    .set(setData)
    .where(
      and(
        eq(directiveExperiments.userId, userId),
        eq(directiveExperiments.projectId, projectId),
        eq(directiveExperiments.id, experimentId),
      ),
    )
    .run();

  return findDirectiveExperimentById(userId, projectId, experimentId);
}

export function createDirectiveEvaluation(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
  experimentId: string;
  outcome: DirectiveEvaluationOutcome;
  usefulness?: string | null;
  friction?: string | null;
  workflowImpact?: string | null;
  evidenceSummary: string;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    capabilityId: input.capabilityId,
    experimentId: input.experimentId,
    outcome: input.outcome,
    usefulness: input.usefulness || null,
    friction: input.friction || null,
    workflowImpact: input.workflowImpact || null,
    evidenceSummary: input.evidenceSummary,
    metadataJson: stringifyJsonField(input.metadata || {}),
    createdAt: now,
    updatedAt: now,
  };

  db.insert(directiveEvaluations).values(row).run();
  return toEvaluationRow(row);
}

export function listDirectiveEvaluationsForCapability(
  userId: string,
  projectId: string,
  capabilityId: string,
) {
  return db
    .select()
    .from(directiveEvaluations)
    .where(
      and(
        eq(directiveEvaluations.userId, userId),
        eq(directiveEvaluations.projectId, projectId),
        eq(directiveEvaluations.capabilityId, capabilityId),
      ),
    )
    .orderBy(desc(directiveEvaluations.createdAt))
    .all()
    .map(toEvaluationRow);
}

export function findDirectiveEvaluationById(
  userId: string,
  projectId: string,
  evaluationId: string,
) {
  const row = db
    .select()
    .from(directiveEvaluations)
    .where(
      and(
        eq(directiveEvaluations.userId, userId),
        eq(directiveEvaluations.projectId, projectId),
        eq(directiveEvaluations.id, evaluationId),
      ),
    )
    .get();
  return row ? toEvaluationRow(row) : null;
}

export function createDirectiveDecision(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
  evaluationId?: string | null;
  decision: DirectiveDecision;
  rationale: string;
  decidedBy?: string;
  metadata?: Record<string, unknown>;
}) {
  const row = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    capabilityId: input.capabilityId,
    evaluationId: input.evaluationId || null,
    decision: input.decision,
    rationale: input.rationale,
    decidedBy: input.decidedBy || "user",
    metadataJson: stringifyJsonField(input.metadata || {}),
    createdAt: new Date().toISOString(),
  };

  db.insert(directiveDecisions).values(row).run();
  return toDecisionRow(row);
}

export function listDirectiveDecisionsForCapability(
  userId: string,
  projectId: string,
  capabilityId: string,
) {
  return db
    .select()
    .from(directiveDecisions)
    .where(
      and(
        eq(directiveDecisions.userId, userId),
        eq(directiveDecisions.projectId, projectId),
        eq(directiveDecisions.capabilityId, capabilityId),
      ),
    )
    .orderBy(desc(directiveDecisions.createdAt))
    .all()
    .map(toDecisionRow);
}

export function createDirectiveIntegration(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
  decisionId: string;
  status?: DirectiveIntegrationStatus;
  integrationMode?: DirectiveIntegrationMode;
  integrationSurface: string;
  targetRuntimeSurface?: string | null;
  owner?: string | null;
  dueAt?: string | null;
  requiredGates?: string[];
  proofArtifactPath?: string | null;
  rollbackPlan?: string | null;
  dependencyNotes?: string | null;
  rollbackNotes?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    capabilityId: input.capabilityId,
    decisionId: input.decisionId,
    status: input.status || "planned",
    integrationMode: input.integrationMode || "adapt",
    integrationSurface: input.integrationSurface,
    targetRuntimeSurface: input.targetRuntimeSurface || null,
    owner: input.owner || null,
    dueAt: input.dueAt || null,
    requiredGatesJson: stringifyJsonField(input.requiredGates || []),
    proofArtifactPath: input.proofArtifactPath || null,
    rollbackPlan: input.rollbackPlan || null,
    dependencyNotes: input.dependencyNotes || null,
    rollbackNotes: input.rollbackNotes || null,
    metadataJson: stringifyJsonField(input.metadata || {}),
    createdAt: now,
    updatedAt: now,
  };

  db.insert(directiveIntegrations).values(row).run();
  return toIntegrationRow(row);
}

export function listDirectiveIntegrationsForCapability(
  userId: string,
  projectId: string,
  capabilityId: string,
) {
  return db
    .select()
    .from(directiveIntegrations)
    .where(
      and(
        eq(directiveIntegrations.userId, userId),
        eq(directiveIntegrations.projectId, projectId),
        eq(directiveIntegrations.capabilityId, capabilityId),
      ),
    )
    .orderBy(desc(directiveIntegrations.createdAt))
    .all()
    .map(toIntegrationRow);
}

export function computeLeadTimeHours(
  capabilityCreatedAt: string,
  decisionCreatedAt: string,
): number | null {
  const start = new Date(capabilityCreatedAt).getTime();
  const end = new Date(decisionCreatedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const hours = (end - start) / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100;
}

export function listDirectiveRegistry(userId: string, projectId: string) {
  const capabilities = listDirectiveCapabilities(userId, projectId, { limit: 200 });
  return capabilities.map((capability) => {
    const experiments = listDirectiveExperimentsForCapability(
      userId,
      projectId,
      capability.id,
    );
    const evaluations = listDirectiveEvaluationsForCapability(
      userId,
      projectId,
      capability.id,
    );
    const decisions = listDirectiveDecisionsForCapability(
      userId,
      projectId,
      capability.id,
    );
    const integrations = listDirectiveIntegrationsForCapability(
      userId,
      projectId,
      capability.id,
    );
    const latestDecision = decisions[0] || null;
    const decisionLeadTimeHours = latestDecision
      ? computeLeadTimeHours(capability.createdAt, latestDecision.createdAt)
      : null;
    const callableIntegration = integrations.find(
      (integration) => integration.status === "active",
    );
    const adoptToCallableLeadTimeHours =
      latestDecision?.decision === "adopt" && callableIntegration
        ? computeLeadTimeHours(capability.createdAt, callableIntegration.updatedAt)
        : null;

    return {
      capability,
      experiments,
      evaluations,
      decisions,
      latestDecision,
      integrations,
      decisionLeadTimeHours,
      adoptToCallableLeadTimeHours,
    };
  });
}
