import { createHash } from "crypto";
import { listQuests, updateQuest, type QuestRow } from "@/server/repositories/quests-repo";
import { createReport, listReports, type ReportStatus } from "@/server/repositories/reports-repo";

export interface HotspotGuardrailConfig {
  cooldownMinutes: number;
  windowMinutes: number;
  minSeverity: "high" | "medium" | "low";
}

export interface HotspotAlertSignal {
  stepId: string;
  severity: "high" | "medium" | "low";
  reasons: string[];
}

export interface HotspotFailureIdentity {
  failureClass: string;
  windowKey: string;
  dedupeKey: string;
}

function floorToWindowIso(now: Date, windowMinutes: number) {
  const sizeMs = Math.max(1, Math.floor(windowMinutes)) * 60_000;
  const floored = Math.floor(now.getTime() / sizeMs) * sizeMs;
  return new Date(floored).toISOString();
}

function severityRank(value: "high" | "medium" | "low") {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

export function normalizeHotspotSignals(
  alerts: HotspotAlertSignal[],
  minSeverity: "high" | "medium" | "low",
): HotspotAlertSignal[] {
  return alerts
    .filter((item) => severityRank(item.severity) >= severityRank(minSeverity))
    .map((item) => ({
      stepId: item.stepId,
      severity: item.severity,
      reasons: [...new Set(item.reasons)].sort(),
    }))
    .sort((left, right) => {
      if (severityRank(right.severity) !== severityRank(left.severity)) {
        return severityRank(right.severity) - severityRank(left.severity);
      }
      return left.stepId.localeCompare(right.stepId);
    });
}

export function buildHotspotFailureIdentity(
  alerts: HotspotAlertSignal[],
  now: Date,
  config: HotspotGuardrailConfig,
): HotspotFailureIdentity {
  const normalized = normalizeHotspotSignals(alerts, config.minSeverity);
  const failureClass = normalized
    .map((item) => `${item.severity}:${item.stepId}:${item.reasons.join(",") || "none"}`)
    .join("|") || "none";
  const windowStart = floorToWindowIso(now, config.windowMinutes);
  const windowKey = `${windowStart}/${config.windowMinutes}m`;
  const digest = createHash("sha1").update(`${windowKey}|${failureClass}`).digest("hex").slice(0, 12);
  return {
    failureClass,
    windowKey,
    dedupeKey: `nightly-hotspot:${digest}`,
  };
}

function findOpenHotspotQuest(userId: string, projectId: string, dedupeKey: string): QuestRow | null {
  const open = listQuests(userId, projectId, {
    status: "open",
    area: "runtime-reliability",
    limit: 200,
  });

  return open.find((quest) => quest.goal.includes(dedupeKey)) ?? null;
}

export function resolveHotspotQuest(
  userId: string,
  projectId: string,
  dedupeKey: string,
): { quest: QuestRow | null; reused: boolean } {
  const existing = findOpenHotspotQuest(userId, projectId, dedupeKey);
  if (!existing) {
    return { quest: null, reused: false };
  }
  const updated = updateQuest(userId, projectId, existing.id, { status: "open" });
  return { quest: updated ?? existing, reused: true };
}

export function shouldSuppressHotspotByCooldown(
  userId: string,
  projectId: string,
  failureClass: string,
  cooldownMinutes: number,
  now: Date,
): { onCooldown: boolean; minutesRemaining: number; lastAlertAt: string | null } {
  const reports = listReports(userId, projectId, {
    area: "runtime-reliability",
    category: "maintenance",
    limit: 200,
  });

  const matched = reports.find((report) => {
    const hotspot = (report.metadata?.hotspot ?? {}) as Record<string, unknown>;
    return (
      hotspot.alertType === "failure"
      && String(hotspot.failureClass || "") === failureClass
    );
  });
  if (!matched) {
    return { onCooldown: false, minutesRemaining: 0, lastAlertAt: null };
  }

  const lastAlertMs = Date.parse(matched.date);
  if (!Number.isFinite(lastAlertMs)) {
    return { onCooldown: false, minutesRemaining: 0, lastAlertAt: matched.date };
  }

  const cooldownMs = Math.max(0, cooldownMinutes) * 60_000;
  const elapsed = now.getTime() - lastAlertMs;
  const remainingMs = cooldownMs - elapsed;
  if (remainingMs <= 0) {
    return { onCooldown: false, minutesRemaining: 0, lastAlertAt: matched.date };
  }

  return {
    onCooldown: true,
    minutesRemaining: Math.ceil(remainingMs / 60_000),
    lastAlertAt: matched.date,
  };
}

export function logHotspotFollowUpReport(input: {
  userId: string;
  projectId: string;
  title: string;
  content: string;
  status: ReportStatus;
  linkedQuestId?: string | null;
  metadata: Record<string, unknown>;
}) {
  return createReport(input.userId, input.projectId, {
    title: input.title,
    content: input.content,
    category: "maintenance",
    status: input.status,
    area: "runtime-reliability",
    linkedQuestId: input.linkedQuestId ?? undefined,
    topics: ["nightly-hotspots", "reliability", "ops"],
    metadata: {
      hotspot: {
        ...(input.metadata.hotspot as Record<string, unknown> || {}),
      },
      ...input.metadata,
    },
  });
}
