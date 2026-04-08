import type {
  DirectiveCapabilityRow,
} from "../../src/server/repositories/directive-workspace-repo.ts";
import {
  findDirectiveCapabilityBySourceRef,
} from "../../src/server/repositories/directive-workspace-repo.ts";
import {
  createDirectiveCapabilityCandidate,
  recordDirectiveCapabilityAnalysis,
} from "../../src/server/services/directive-workspace-service.ts";
import {
  buildCompatibleAdmissionSourceRefs,
  buildDirectiveWorkspaceAdmissionSourceRef,
} from "./source-ref.ts";
import type {
  AdmissionStatus,
  ToolAdmissionResult,
} from "./rubric.ts";

export interface DirectiveAdmissionSyncSummary {
  total: number;
  created: number;
  analyzed: number;
  protected: number;
}

function mapStatusToRecommendation(status: AdmissionStatus) {
  if (status === "promote") return "test" as const;
  if (status === "park") return "monitor" as const;
  return "ignore" as const;
}

function buildAnalysisSummary(result: ToolAdmissionResult) {
  return [
    `Admission status: ${result.status}.`,
    `Score: ${result.score}.`,
    result.reason,
    `Next action: ${result.nextAction}`,
  ].join(" ");
}

function shouldProtectManualLifecycle(row: DirectiveCapabilityRow) {
  return (
    row.status === "experimenting" ||
    row.status === "evaluated" ||
    row.status === "decided" ||
    row.status === "integrated"
  );
}

export function syncDirectiveWorkspaceFromAdmission(input: {
  userId: string;
  projectId: string;
  results: ToolAdmissionResult[];
}) {
  let created = 0;
  let analyzed = 0;
  let protectedCount = 0;

  const results = [...input.results].sort((a, b) => a.tool.localeCompare(b.tool));
  for (const result of results) {
    const sourceRef = buildDirectiveWorkspaceAdmissionSourceRef(result.repoPath);
    let capability =
      buildCompatibleAdmissionSourceRefs(result.repoPath)
        .map((candidateSourceRef) =>
          findDirectiveCapabilityBySourceRef(
            input.userId,
            input.projectId,
            candidateSourceRef,
          ),
        )
        .find(Boolean) || null;

    if (!capability) {
      capability = createDirectiveCapabilityCandidate({
        userId: input.userId,
        projectId: input.projectId,
        sourceType: "github-repo",
        sourceRef,
        title: result.tool,
        userIntent: `Evaluate ${result.tool} for workspace adoption.`,
        notes: [
          "seeded-from-tool-admission",
          `admission-status:${result.status}`,
          `admission-score:${result.score}`,
        ],
        metadata: {
          seededFrom: "tool-admission-catalog",
          tool: result.tool,
          admissionStatus: result.status,
          admissionScore: result.score,
          weightedBreakdown: result.weightedBreakdown,
        },
      });
      created += 1;
    }

    if (shouldProtectManualLifecycle(capability)) {
      protectedCount += 1;
      continue;
    }

    recordDirectiveCapabilityAnalysis({
      userId: input.userId,
      projectId: input.projectId,
      capabilityId: capability.id,
      analysisSummary: buildAnalysisSummary(result),
      category: "tooling-repo",
      problemFit: "capability-adoption",
      overlapNotes: result.criteria.workflowFit.evidence,
      riskNotes: result.criteria.runtimeReliability.evidence,
      recommendation: mapStatusToRecommendation(result.status),
      metadata: {
        seededFrom: "tool-admission-catalog",
        tool: result.tool,
        repoPath: result.repoPath,
        admissionStatus: result.status,
        admissionScore: result.score,
        weightedBreakdown: result.weightedBreakdown,
        nextAction: result.nextAction,
      },
    });
    analyzed += 1;
  }

  return {
    total: results.length,
    created,
    analyzed,
    protected: protectedCount,
  } satisfies DirectiveAdmissionSyncSummary;
}
