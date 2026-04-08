import { createHash } from "crypto";
import { listQuests, updateQuest, type QuestRow } from "@/server/repositories/quests-repo";
import { createReport, listReports, type ReportStatus } from "@/server/repositories/reports-repo";

export interface CanaryGuardrailConfig {
  cooldownMinutes: number;
  windowMinutes: number;
}

export interface CanaryFailureIdentity {
  failureClass: string;
  windowKey: string;
  dedupeKey: string;
}

function floorToWindowIso(now: Date, windowMinutes: number) {
  const sizeMs = Math.max(1, Math.floor(windowMinutes)) * 60_000;
  const floored = Math.floor(now.getTime() / sizeMs) * sizeMs;
  return new Date(floored).toISOString();
}

export function buildCanaryFailureIdentity(
  failedChecks: string[],
  now: Date,
  config: CanaryGuardrailConfig,
): CanaryFailureIdentity {
  const failureClass = [...new Set(failedChecks)].sort().join("+") || "unknown";
  const windowStart = floorToWindowIso(now, config.windowMinutes);
  const windowKey = `${windowStart}/${config.windowMinutes}m`;
  const digest = createHash("sha1").update(`${windowKey}|${failureClass}`).digest("hex").slice(0, 12);
  return {
    failureClass,
    windowKey,
    dedupeKey: `nightly-canary:${digest}`,
  };
}

function findOpenCanaryQuest(userId: string, projectId: string, dedupeKey: string): QuestRow | null {
  const open = listQuests(userId, projectId, {
    status: "open",
    area: "runtime-reliability",
    limit: 200,
  });

  return open.find((quest) => quest.goal.includes(dedupeKey)) ?? null;
}

export function resolveCanaryQuest(
  userId: string,
  projectId: string,
  dedupeKey: string,
): { quest: QuestRow | null; reused: boolean } {
  const existing = findOpenCanaryQuest(userId, projectId, dedupeKey);
  if (!existing) {
    return { quest: null, reused: false };
  }

  const updated = updateQuest(userId, projectId, existing.id, { status: "open" });
  return { quest: updated ?? existing, reused: true };
}

export function shouldSuppressByCooldown(
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
    const canary = (report.metadata?.canary ?? {}) as Record<string, unknown>;
    return (
      canary.alertType === "failure"
      && String(canary.failureClass || "") === failureClass
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

export function logCanaryFollowUpReport(input: {
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
    topics: ["reliability", "nightly-canary", "ops"],
    metadata: {
      canary: {
        ...(input.metadata.canary as Record<string, unknown> || {}),
      },
      ...input.metadata,
    },
  });
}
