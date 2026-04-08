import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DIRECTIVE_WORKSPACE_V0,
  normalizeDirectiveCapabilityStatus,
  type DirectiveIntegrationProof,
  type DirectiveRuntimeStatus,
} from "@/lib/directive-workspace/v0";
import {
  runtimeStatusFromIntegrationStatus,
} from "@/lib/directive-workspace/decision-policy";
import { normalizeDirectiveDecisionContract } from "@/lib/directive-workspace/decision-contract";
import {
  normalizeDirectiveAnalysisContract,
  normalizeDirectiveCandidateContract,
  normalizeDirectiveEvaluationContract,
  normalizeDirectiveExperimentContract,
} from "@/lib/directive-workspace/workflow-contract";
import {
  buildDirectiveDecisionReportContent,
  buildDirectiveIntegrationProofArtifactContent,
  buildDirectiveIntegrationProofReportContent,
  computeDirectiveLeadTimeHours,
  proofTimestampSuffix,
  reportHrefFromDate,
  summarizeDirectiveLifecycle,
} from "@/lib/directive-workspace/presentation-contract";
import {
  buildDirectiveIntegrationProof,
  normalizeDirectiveProofRequest,
} from "@/lib/directive-workspace/proof-contract";
import {
  buildDirectiveAnalysisCapabilityPatch,
  buildDirectiveDecisionCapabilityPatch,
  buildDirectiveEvaluationCapabilityPatch,
  buildDirectiveExperimentCapabilityPatch,
  buildDirectiveProofMetadata,
} from "@/lib/directive-workspace/capability-patch-contract";
import { buildDirectiveLifecycleArtifacts } from "@/lib/directive-workspace/lifecycle-artifacts";
import { createReport } from "@/server/repositories/reports-repo";
import {
  createDirectiveCapability,
  createDirectiveDecision,
  createDirectiveEvaluation,
  createDirectiveExperiment,
  createDirectiveIntegration,
  findDirectiveCapabilityById,
  findDirectiveEvaluationById,
  findDirectiveExperimentById,
  listDirectiveDecisionsForCapability,
  listDirectiveEvaluationsForCapability,
  listDirectiveExperimentsForCapability,
  listDirectiveIntegrationsForCapability,
  listDirectiveRegistry,
  updateDirectiveExperiment,
  updateDirectiveCapability,
} from "@/server/repositories/directive-workspace-repo";

function requireCapability(
  userId: string,
  projectId: string,
  capabilityId: string,
) {
  const capability = findDirectiveCapabilityById(userId, projectId, capabilityId);
  if (!capability) {
    throw new Error(`invalid_input: capability not found for id=${capabilityId}`);
  }
  return capability;
}

export function createDirectiveCapabilityCandidate(input: {
  userId: string;
  projectId: string;
  sourceType?: unknown;
  sourceRef: unknown;
  title?: unknown;
  userIntent?: unknown;
  notes?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const candidate = normalizeDirectiveCandidateContract(input);

  return createDirectiveCapability({
    userId: input.userId,
    projectId: input.projectId,
    sourceType: candidate.sourceType,
    sourceRef: candidate.sourceRef,
    title: candidate.title,
    workflowFamily: DIRECTIVE_WORKSPACE_V0.workflowFamily,
    frameworkStatus: "intake",
    runtimeStatus: "none",
    userIntent: candidate.userIntent,
    notes: candidate.notes,
    metadata: candidate.metadata,
  });
}

export function recordDirectiveCapabilityAnalysis(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
  analysisSummary: unknown;
  category?: unknown;
  problemFit?: unknown;
  overlapNotes?: unknown;
  riskNotes?: unknown;
  recommendation: unknown;
  metadata?: Record<string, unknown>;
}) {
  requireCapability(input.userId, input.projectId, input.capabilityId);
  const analysis = normalizeDirectiveAnalysisContract(input);

  return updateDirectiveCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
    buildDirectiveAnalysisCapabilityPatch(analysis),
  );
}

export function proposeDirectiveCapabilityExperiment(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
  hypothesis: unknown;
  plan: unknown;
  successCriteria?: unknown;
  runId?: unknown;
  artifactPath?: unknown;
  status?: unknown;
  metadata?: Record<string, unknown>;
}) {
  requireCapability(input.userId, input.projectId, input.capabilityId);
  const experimentInput = normalizeDirectiveExperimentContract(input);

  const experiment = createDirectiveExperiment({
    userId: input.userId,
    projectId: input.projectId,
    capabilityId: input.capabilityId,
    runId: experimentInput.runId,
    hypothesis: experimentInput.hypothesis,
    plan: experimentInput.plan,
    successCriteria: experimentInput.successCriteria,
    artifactPath: experimentInput.artifactPath,
    status: experimentInput.status,
    metadata: experimentInput.metadata,
  });

  updateDirectiveCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
    buildDirectiveExperimentCapabilityPatch(),
  );

  return experiment;
}

export function recordDirectiveCapabilityEvaluation(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
  experimentId: string;
  outcome: unknown;
  usefulness?: unknown;
  friction?: unknown;
  workflowImpact?: unknown;
  evidenceSummary: unknown;
  metadata?: Record<string, unknown>;
}) {
  const capability = requireCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
  );
  const experiment = findDirectiveExperimentById(
    input.userId,
    input.projectId,
    input.experimentId,
  );
  if (!experiment || experiment.capabilityId !== input.capabilityId) {
    throw new Error(
      `invalid_input: experiment not found for capabilityId=${input.capabilityId}`,
    );
  }
  const evaluationInput = normalizeDirectiveEvaluationContract(input);
  const lifecycleArtifacts = buildDirectiveLifecycleArtifacts({
    capabilityId: input.capabilityId,
    sourceRef: capability.sourceRef,
    evidenceSummary: evaluationInput.evidenceSummary,
    metadata: evaluationInput.metadata,
  });
  const evaluationMetadata = {
    ...evaluationInput.metadata,
    lifecycleArtifactVersion: 1,
    lifecycleArtifacts,
  };

  const evaluation = createDirectiveEvaluation({
    userId: input.userId,
    projectId: input.projectId,
    capabilityId: input.capabilityId,
    experimentId: input.experimentId,
    outcome: evaluationInput.outcome,
    usefulness: evaluationInput.usefulness,
    friction: evaluationInput.friction,
    workflowImpact: evaluationInput.workflowImpact,
    evidenceSummary: evaluationInput.evidenceSummary,
    metadata: evaluationMetadata,
  });

  updateDirectiveExperiment(input.userId, input.projectId, input.experimentId, {
    status: "completed",
  });
  updateDirectiveCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
    buildDirectiveEvaluationCapabilityPatch(),
  );
  return evaluation;
}

export async function createDirectiveCapabilityIntegrationProof(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
  method?: unknown;
  reference?: unknown;
  summary?: unknown;
}) {
  const capability = requireCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
  );
  const proofRequest = normalizeDirectiveProofRequest({
    capabilityId: capability.id,
    method: input.method,
    reference: input.reference,
    summary: input.summary,
  });

  const artifactDir = path.resolve(process.cwd(), "reports", "ops");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.resolve(
    artifactDir,
    `directive-integration-proof-${capability.id}-${proofTimestampSuffix(proofRequest.timestamp)}.md`,
  );

  await writeFile(
    artifactPath,
    buildDirectiveIntegrationProofArtifactContent({
      capabilityId: capability.id,
      title: capability.title,
      sourceRef: capability.sourceRef,
      timestamp: proofRequest.timestamp,
      method: proofRequest.method,
      reference: proofRequest.reference,
      summary: proofRequest.summary,
    }),
    "utf8",
  );

  const report = createReport(input.userId, input.projectId, {
    title: `Directive integration proof: ${capability.title}`,
    content: buildDirectiveIntegrationProofReportContent({
      capabilityId: capability.id,
      title: capability.title,
      sourceRef: capability.sourceRef,
      timestamp: proofRequest.timestamp,
      method: proofRequest.method,
      reference: proofRequest.reference,
      summary: proofRequest.summary,
      artifactPath,
    }),
    category: "maintenance",
    status: "success",
    area: "directive-workspace",
    source: "Mission Control",
    topics: ["directive-workspace", "integration-proof"],
    metadata: {
      capabilityId: capability.id,
      integrationProof: {
        method: proofRequest.method,
        reference: proofRequest.reference,
        timestamp: proofRequest.timestamp,
        artifactPath,
      },
    },
  });

  const integrationProof: DirectiveIntegrationProof = buildDirectiveIntegrationProof(
    {
      reportId: report.id,
      reportHref: reportHrefFromDate(report.date),
      artifactPath,
      request: proofRequest,
    },
  );

  const metadata = buildDirectiveProofMetadata({
    capabilityMetadata: capability.metadata || {},
    integrationProof,
    timestamp: proofRequest.timestamp,
  });
  const updatedCapability = updateDirectiveCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
    { metadata },
  );

  return {
    capability: updatedCapability,
    integrationProof,
    reportId: report.id,
    reportHref: reportHrefFromDate(report.date),
    artifactPath,
  };
}

export function recordDirectiveCapabilityDecision(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
  evaluationId?: string;
  decision: unknown;
  rationale: unknown;
  decidedBy?: unknown;
  integrationSurface?: unknown;
  targetRuntimeSurface?: unknown;
  integrationMode?: unknown;
  owner?: unknown;
  dueAt?: unknown;
  requiredGates?: unknown;
  integrationStatus?: unknown;
  rollbackPlan?: unknown;
  dependencyNotes?: unknown;
  rollbackNotes?: unknown;
  integrationProof?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const capability = requireCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
  );
  const decisionContract = normalizeDirectiveDecisionContract(input);
  const decision = decisionContract.decision;
  const rationale = String(input.rationale || "").trim();
  if (!rationale) {
    throw new Error("invalid_input: rationale is required");
  }

  const evaluationId = String(input.evaluationId || "").trim() || null;
  if (evaluationId) {
    const evaluation = findDirectiveEvaluationById(
      input.userId,
      input.projectId,
      evaluationId,
    );
    if (!evaluation || evaluation.capabilityId !== input.capabilityId) {
      throw new Error(
        `invalid_input: evaluation not found for capabilityId=${input.capabilityId}`,
      );
    }
  }

  const adopt = decisionContract.adopt;
  const integrationProof = adopt?.integrationProof || null;

  const decisionRow = createDirectiveDecision({
    userId: input.userId,
    projectId: input.projectId,
    capabilityId: input.capabilityId,
    evaluationId,
    decision,
    rationale,
    decidedBy: String(input.decidedBy || "").trim() || "user",
    metadata: input.metadata || {},
  });

  let integration = null;
  let runtimeStatus: DirectiveRuntimeStatus = "none";
  if (adopt) {
    integration = createDirectiveIntegration({
      userId: input.userId,
      projectId: input.projectId,
      capabilityId: input.capabilityId,
      decisionId: decisionRow.id,
      status: adopt.integrationStatus,
      integrationMode: adopt.integrationMode,
      integrationSurface: adopt.integrationSurface,
      targetRuntimeSurface: adopt.targetRuntimeSurface,
      owner: adopt.owner,
      dueAt: adopt.dueAt,
      requiredGates: adopt.requiredGates,
      proofArtifactPath: integrationProof?.artifact.artifactPath || null,
      rollbackPlan: adopt.rollbackPlan,
      dependencyNotes: String(input.dependencyNotes || "").trim() || null,
      rollbackNotes: String(input.rollbackNotes || "").trim() || null,
      metadata: {
        ...(input.metadata || {}),
        integrationProof,
      },
    });
    runtimeStatus = runtimeStatusFromIntegrationStatus(adopt.integrationStatus);
  }

  const decisionLeadTimeHours = computeDirectiveLeadTimeHours(
    capability.createdAt,
    decisionRow.createdAt,
  );
  const adoptToCallableLeadTimeHours =
    integration && decision === "adopt"
      ? computeDirectiveLeadTimeHours(capability.createdAt, integration.updatedAt)
      : null;

  const updatedCapability = updateDirectiveCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
    buildDirectiveDecisionCapabilityPatch({
      decision,
      runtimeStatus,
    }),
  );

  const report = createReport(input.userId, input.projectId, {
    title: `Directive decision: ${decision} - ${capability.title}`,
    content: buildDirectiveDecisionReportContent({
      capabilityId: capability.id,
      title: capability.title,
      sourceType: capability.sourceType,
      sourceRef: capability.sourceRef,
      decision,
      rationale,
      integrationSurface: integration?.integrationSurface || null,
      decisionLeadTimeHours,
      adoptToCallableLeadTimeHours,
    }),
    category: "maintenance",
    status: decision === "adopt" ? "success" : "info",
    area: "directive-workspace",
    source: "Mission Control",
    topics: ["directive-workspace", "capability-decision"],
    metadata: {
      capabilityId: capability.id,
      decisionId: decisionRow.id,
      integrationId: integration?.id || null,
      evaluationId,
      decision,
      integrationProof,
    },
  });

  return {
    capability: updatedCapability,
    decision: decisionRow,
    integration,
    adoptToCallableLeadTimeHours,
    reportId: report.id,
    reportHref: reportHrefFromDate(report.date),
  };
}

export function getDirectiveCapabilityLifecycle(input: {
  userId: string;
  projectId: string;
  capabilityId: string;
}) {
  const capability = requireCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
  );
  const decisions = listDirectiveDecisionsForCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
  );
  const integrations = listDirectiveIntegrationsForCapability(
    input.userId,
    input.projectId,
    input.capabilityId,
  );
  const lifecycle = summarizeDirectiveLifecycle({
    capability,
    decisions,
    integrations,
  });
  return {
    v0: DIRECTIVE_WORKSPACE_V0,
    capability,
    experiments: listDirectiveExperimentsForCapability(
      input.userId,
      input.projectId,
      input.capabilityId,
    ),
    evaluations: listDirectiveEvaluationsForCapability(
      input.userId,
      input.projectId,
      input.capabilityId,
    ),
    decisions,
    integrations,
    latestDecision: lifecycle.latestDecision,
    decisionLeadTimeHours: lifecycle.decisionLeadTimeHours,
    adoptToCallableLeadTimeHours: lifecycle.adoptToCallableLeadTimeHours,
  };
}

export function listDirectiveWorkspaceRegistry(input: {
  userId: string;
  projectId: string;
  status?: unknown;
}) {
  const requestedStatus = String(input.status || "").trim();
  const rows = listDirectiveRegistry(input.userId, input.projectId);
  if (!requestedStatus) {
    return rows;
  }

  const normalizedStatus = normalizeDirectiveCapabilityStatus(requestedStatus);
  return rows.filter((row) => row.capability.status === normalizedStatus);
}
