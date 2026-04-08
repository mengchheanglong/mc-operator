import { createQuest, listQuests, type QuestRow } from "@/server/repositories/quests-repo";
import { createReport } from "@/server/repositories/reports-repo";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";
import { findOrCreateUser } from "@/server/repositories/users-repo";
import {
  computeFailureWindowKey,
  decideRouteModel,
  evaluateReliability,
  type ReliabilitySample,
  type ReliabilitySummary,
  type ReliabilityThresholds,
  type RouteDecision,
  type RouteDecisionInput,
} from "./reliability-ops-core";

export type {
  ReliabilitySample,
  ReliabilitySummary,
  ReliabilityThresholds,
  RouteDecision,
  RouteDecisionInput,
};
export { evaluateReliability, decideRouteModel };

export function ensureReliabilityQuest(summary: ReliabilitySummary): { created: boolean; quest: QuestRow | null; windowKey: string } {
  const windowKey = computeFailureWindowKey(summary);
  if (summary.ok) return { created: false, quest: null, windowKey };

  const user = findOrCreateUser();
  const projectId = getControlPlaneProjectId();
  const existing = listQuests(user.id, projectId, { area: "runtime-reliability", status: "open", limit: 100 });
  const duplicate = existing.find((quest) => quest.goal.includes(windowKey));
  if (duplicate) return { created: false, quest: duplicate, windowKey };

  const goal = `Reliability remediation ${windowKey}`.slice(0, 100);
  const quest = createQuest(user.id, projectId, goal, "normal", ["reliability", "ops", "auto-remediation"], "open", "runtime-reliability");

  createReport(user.id, projectId, {
    title: "Auto-created reliability remediation quest",
    content: [
      `Window: ${windowKey}`,
      `Reasons: ${summary.reasons.join(", ")}`,
      `Sample size: ${summary.total}/${summary.required}`,
      `Top failures: ${summary.top_failure_classes.map((item) => `${item.name}(${item.count})`).join(", ") || "none"}`,
      `Recent failing runs: ${summary.recent_failures.map((item) => `${item.id}${item.timestamp ? `@${item.timestamp}` : ""}`).join(", ") || "none"}`,
      "Suggested next action: inspect failing run traces and tune fallback route thresholds.",
    ].join("\n"),
    category: "maintenance",
    status: "warning",
    area: "runtime-reliability",
    linkedQuestId: quest.id,
    topics: ["reliability", "auto-remediation"],
    metadata: { reliability_window: windowKey, summary },
  });

  return { created: true, quest, windowKey };
}
