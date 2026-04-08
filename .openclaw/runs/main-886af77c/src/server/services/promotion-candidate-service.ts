import { normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import type { DocWithTags } from "@/server/repositories/docs-repo";
import type { DailyReportLogItem } from "@/server/services/daily-report-log-service";

export interface PromotionCandidate {
  id: string;
  kind: "topic" | "area" | "hub_doc";
  label: string;
  reason: string;
  suggestedDocTitle: string;
  sourceDays: string[];
}

export interface PromotionCandidateSnapshot {
  summary: string;
  candidates: PromotionCandidate[];
}

function matchesExistingDoc(docs: DocWithTags[], value: string) {
  const normalized = normalizeDocumentTitle(value);
  if (!normalized) {
    return false;
  }

  return docs.some((doc) => {
    const titleMatch = normalizeDocumentTitle(doc.title).includes(normalized);
    const tagMatch = doc.tags.some((tag) => normalizeDocumentTitle(tag).includes(normalized));
    return titleMatch || tagMatch;
  });
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildTopicTitle(topic: string) {
  return `${titleCase(topic)} Guide`;
}

function buildAreaTitle(area: string) {
  return `${titleCase(area)} Workflow`;
}

export function buildPromotionCandidateSnapshot(
  docs: DocWithTags[],
  dailyLogs: DailyReportLogItem[],
): PromotionCandidateSnapshot {
  const topicDays = new Map<string, Set<string>>();
  const areaDays = new Map<string, Set<string>>();

  for (const log of dailyLogs) {
    for (const topic of log.topics) {
      const normalized = normalizeDocumentTitle(topic);
      if (!normalized) continue;
      const set = topicDays.get(normalized) || new Set<string>();
      set.add(log.dayKey);
      topicDays.set(normalized, set);
    }

    for (const area of log.areas) {
      const normalized = normalizeDocumentTitle(area);
      if (!normalized) continue;
      const set = areaDays.get(normalized) || new Set<string>();
      set.add(log.dayKey);
      areaDays.set(normalized, set);
    }
  }

  const candidates: PromotionCandidate[] = [];

  for (const [topic, days] of topicDays.entries()) {
    if (days.size < 2 || matchesExistingDoc(docs, topic)) {
      continue;
    }

    candidates.push({
      id: `topic:${topic}`,
      kind: "topic",
      label: topic,
      reason: `This topic appears across ${days.size} different daily logs but does not have a durable reference doc yet.`,
      suggestedDocTitle: buildTopicTitle(topic),
      sourceDays: Array.from(days).sort((left, right) => right.localeCompare(left)),
    });
  }

  for (const [area, days] of areaDays.entries()) {
    if (days.size < 2 || matchesExistingDoc(docs, area)) {
      continue;
    }

    candidates.push({
      id: `area:${area}`,
      kind: "area",
      label: area,
      reason: `This work area appears across ${days.size} daily logs but has no dedicated workflow or map doc.`,
      suggestedDocTitle: buildAreaTitle(area),
      sourceDays: Array.from(days).sort((left, right) => right.localeCompare(left)),
    });
  }

  const hasMapDoc = docs.some((doc) =>
    ["map", "charter", "workflow", "architecture", "guide"].some((keyword) =>
      normalizeDocumentTitle(`${doc.title} ${doc.tags.join(" ")}`).includes(keyword),
    ),
  );

  if (!hasMapDoc && docs.length >= 5) {
    candidates.unshift({
      id: "hub:workspace-map",
      kind: "hub_doc",
      label: "workspace map",
      reason: "The project has enough docs to benefit from a curated hub or map-of-content doc.",
      suggestedDocTitle: "Workspace Map",
      sourceDays: dailyLogs.slice(0, 3).map((log) => log.dayKey),
    });
  }

  const trimmed = candidates.slice(0, 6);

  return {
    summary: trimmed.length > 0
      ? `${trimmed.length} durable doc candidates were inferred from repeated daily work patterns.`
      : "No durable doc promotions are suggested right now.",
    candidates: trimmed,
  };
}
