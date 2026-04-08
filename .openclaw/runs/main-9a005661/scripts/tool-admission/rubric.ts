export type AdmissionStatus = "promote" | "park" | "defer";

export type CriterionKey =
  | "workflowFit"
  | "integrationComplexity"
  | "runtimeReliability"
  | "maintenanceBurden"
  | "costTokenImpact"
  | "productivityGain";

export type ToolCriterion = {
  score: number; // 0-10, higher is better
  evidence: string;
};

export type ToolAdmissionInput = {
  tool: string;
  repoPath: string;
  notes?: string;
  criteria: Record<CriterionKey, ToolCriterion>;
};

export type ToolAdmissionResult = {
  tool: string;
  repoPath: string;
  score: number;
  status: AdmissionStatus;
  reason: string;
  nextAction: string;
  criteria: Record<CriterionKey, ToolCriterion>;
  weightedBreakdown: Record<CriterionKey, number>;
};

const WEIGHTS: Record<CriterionKey, number> = {
  workflowFit: 0.24,
  integrationComplexity: 0.14,
  runtimeReliability: 0.2,
  maintenanceBurden: 0.14,
  costTokenImpact: 0.1,
  productivityGain: 0.18,
};

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score < 0) return 0;
  if (score > 10) return 10;
  return score;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

export function scoreTool(input: ToolAdmissionInput): ToolAdmissionResult {
  const weightedBreakdown = {} as Record<CriterionKey, number>;
  let weightedScore = 0;

  (Object.keys(WEIGHTS) as CriterionKey[]).forEach((key) => {
    const normalized = clampScore(input.criteria[key].score) / 10;
    const weighted = normalized * WEIGHTS[key] * 100;
    weightedBreakdown[key] = round(weighted);
    weightedScore += weighted;
  });

  const score = round(weightedScore);

  const hardDefer =
    clampScore(input.criteria.runtimeReliability.score) < 4 ||
    clampScore(input.criteria.workflowFit.score) < 4;

  let status: AdmissionStatus;
  if (hardDefer || score < 55) {
    status = "defer";
  } else if (score >= 75) {
    status = "promote";
  } else {
    status = "park";
  }

  const reason = buildReason(status, score, input.criteria);
  const nextAction = buildNextAction(status, input.tool);

  return {
    tool: input.tool,
    repoPath: input.repoPath,
    score,
    status,
    reason,
    nextAction,
    criteria: input.criteria,
    weightedBreakdown,
  };
}

function buildReason(status: AdmissionStatus, score: number, criteria: ToolAdmissionInput["criteria"]): string {
  const keySignals = [
    `fit ${criteria.workflowFit.score}/10`,
    `reliability ${criteria.runtimeReliability.score}/10`,
    `productivity ${criteria.productivityGain.score}/10`,
  ].join(", ");

  if (status === "promote") {
    return `High admission score (${score}) with strong ${keySignals}.`;
  }
  if (status === "park") {
    return `Mid-range admission score (${score}); valuable but blocked by integration/maintenance constraints (${keySignals}).`;
  }
  return `Low admission score (${score}) or hard guard miss; defer until core gaps close (${keySignals}).`;
}

function buildNextAction(status: AdmissionStatus, tool: string): string {
  if (status === "promote") {
    return `Create bounded integration quest for ${tool} with reliability checks and rollback guard.`;
  }
  if (status === "park") {
    return `Document extracted patterns for ${tool} and re-evaluate after one release cycle.`;
  }
  return `Keep ${tool} in deferred backlog and require explicit trigger + acceptance criteria before retry.`;
}

export function summarize(results: ToolAdmissionResult[]) {
  const totals = results.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      acc.totalScore += item.score;
      return acc;
    },
    { promote: 0, park: 0, defer: 0, totalScore: 0 },
  );

  return {
    totalTools: results.length,
    promote: totals.promote,
    park: totals.park,
    defer: totals.defer,
    averageScore: round(results.length === 0 ? 0 : totals.totalScore / results.length),
  };
}
