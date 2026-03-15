import { buildPromptPackHref } from "@/lib/context-pack/href";
import { extractLinks, normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import { listDocs } from "@/server/repositories/docs-repo";
import { listNotes } from "@/server/repositories/notes-repo";
import { listQuests } from "@/server/repositories/quests-repo";
import { countReports, listReports } from "@/server/repositories/reports-repo";
import { findUserById } from "@/server/repositories/users-repo";
import type { WorkspaceProject } from "@/server/projects/workspace-projects";
import {
  buildRepoSnapshot,
  buildWorkspaceReadiness,
  type RepoSnapshot,
  type WorkspaceReadiness,
} from "@/server/services/workspace-intel-service";
import { buildN8nAutomationSnapshot } from "@/server/services/n8n-service";
import { evaluateReliability, type ReliabilitySample } from "@/server/services/reliability-ops-service";
import type { AutomationSnapshotView } from "@/types/context-pack";

type DashboardDoc = {
  id: string;
  title: string;
  tags: string[];
  updatedAt: string;
  createdAt: string;
  links: string[];
  incomingCount: number;
  outgoingCount: number;
  degree: number;
};

type DashboardQuest = {
  id: string;
  goal: string;
  difficulty: "easy" | "normal" | "hard" | "nightmare" | "hell";
  completed: boolean;
  date: string;
  completedDate?: string | null;
};

type DashboardNote = {
  id: string;
  content: string;
  completed: boolean;
  updatedAt: string;
  createdAt: string;
};

type DashboardReport = {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  source: string;
  area: string | null;
  topics: string[];
  date: string;
};

export interface DashboardActionItem {
  id: string;
  kind: "doc" | "graph" | "note" | "handoff";
  title: string;
  description: string;
  href: string;
}

export interface DashboardActivityItem {
  id: string;
  kind: "doc" | "quest" | "note" | "report";
  title: string;
  description: string;
  href: string;
  timestamp: string;
  tone?: "default" | "success" | "warning";
}

export interface DashboardSuggestion {
  id: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  tone: "primary" | "secondary" | "warning";
}

export interface DashboardSnapshot {
  project: {
    id: string;
    name: string;
    relativePath: string;
  };
  overview: {
    docCount: number;
    noteCount: number;
    connectionCount: number;
    reportCount: number;
  };
  metrics: {
    openQuests: number;
    unresolvedLinks: number;
    orphanDocs: number;
    pendingNotes: number;
    changedFiles: number;
  };
  workSummary: {
    questStatusCounts: {
      open: number;
      inProgress: number;
      blocked: number;
      done: number;
    };
    questAreas: Array<{ area: string; count: number }>;
    reportAreas: Array<{ area: string; count: number }>;
  };
  todayLog: {
    dayKey: string;
    entryCount: number;
    areas: string[];
    entries: Array<{
      id: string;
      title: string;
      content: string;
      status: string;
      category: string;
      area: string | null;
      topics: string[];
      source: string;
      date: string;
    }>;
  };
  reliabilityOps: {
    timeout_rate: number;
    failover_rate: number;
    tool_error_rate: number;
    avg_duration_ms: number;
    sample_size: number;
    status: "healthy" | "degraded" | "insufficient_data";
    trend24h: Array<{ at: string; timeout_rate: number; failover_rate: number; tool_error_rate: number }>;
  };
  resumeWork: DashboardActionItem[];
  activeQuests: DashboardQuest[];
  health: {
    mostConnectedDoc: DashboardDoc | null;
    recentlyUpdatedDoc: DashboardDoc | null;
    unresolvedTargets: Array<{
      title: string;
      count: number;
      sources: Array<{ id: string; title: string }>;
    }>;
    orphanDocs: DashboardDoc[];
    topTags: Array<{ tag: string; count: number }>;
    staleDocs: DashboardDoc[];
  };
  assistantReadiness: WorkspaceReadiness;
  automation: AutomationSnapshotView;
  repoSnapshot: Pick<
    RepoSnapshot,
    | "project"
    | "stack"
    | "dashboardSurfaces"
    | "scripts"
    | "verificationPresets"
    | "codeIntel"
    | "git"
    | "hotspots"
  >;
  greeting: string;
  recentActivity: DashboardActivityItem[];
  suggestions: DashboardSuggestion[];
}

function toIsoString(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function trimText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function formatDayKey(dateValue: string, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date(dateValue));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

export async function buildDashboardSnapshot(
  userId: string,
  project: WorkspaceProject,
): Promise<DashboardSnapshot> {
  const timezone = findUserById(userId)?.timezone || "Asia/Bangkok";
  const docRows = listDocs(userId, project.id);
  const questRows = listQuests(userId, project.id);
  const noteRows = listNotes(userId, project.id);
  const reportRows = listReports(userId, project.id, { limit: 8 });
  const reportRowsForToday = listReports(userId, project.id, { limit: 200 });

  const docs: DashboardDoc[] = docRows.map((row) => ({
    id: String(row.id),
    title: String(row.title || "Untitled"),
    tags: Array.isArray(row.tags)
      ? row.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [],
    updatedAt: toIsoString(row.updatedAt),
    createdAt: toIsoString(row.createdAt),
    links: extractLinks(String(row.content || "")),
    incomingCount: 0,
    outgoingCount: 0,
    degree: 0,
  }));

  const quests: DashboardQuest[] = questRows.map((row) => ({
    id: String(row.id),
    goal: String(row.goal || ""),
    difficulty: (row.difficulty || "normal") as DashboardQuest["difficulty"],
    completed: Boolean(row.completed),
    date: toIsoString(row.date),
    completedDate: row.completedDate ? toIsoString(row.completedDate) : null,
  }));

  const notes: DashboardNote[] = noteRows.map((row) => ({
    id: String(row.id),
    content: String(row.content || ""),
    completed: Boolean(row.completed),
    updatedAt: toIsoString(row.updatedAt),
    createdAt: toIsoString(row.createdAt),
  }));

  const reports: DashboardReport[] = reportRows.map((row) => ({
    id: String(row.id),
    title: String(row.title || "Untitled"),
    content: String(row.content || ""),
    category: String(row.category || "system"),
    status: String(row.status || "info"),
    area: row.area || null,
    source: String(row.source || "OpenClaw"),
    topics: Array.isArray(row.topics)
      ? row.topics.map((topic) => String(topic || "").trim()).filter(Boolean)
      : [],
    date: toIsoString(row.date),
  }));

  const todayDayKey = formatDayKey(new Date().toISOString(), timezone);
  const todayReports = reportRowsForToday
    .map((row) => ({
      id: String(row.id),
      title: String(row.title || "Untitled"),
      content: String(row.content || ""),
      category: String(row.category || "system"),
      status: String(row.status || "info"),
      area: row.area || null,
      source: String(row.source || "OpenClaw"),
      topics: Array.isArray(row.topics)
        ? row.topics.map((topic) => String(topic || "").trim()).filter(Boolean)
        : [],
      date: toIsoString(row.date),
    }))
    .filter((report) => formatDayKey(report.date, timezone) === todayDayKey)
    .sort(
      (left, right) =>
        new Date(right.date).getTime() - new Date(left.date).getTime(),
    );

  const docsByTitle = new Map(
    docs.map((document) => [normalizeDocumentTitle(document.title), document]),
  );
  const assistantReadiness = buildWorkspaceReadiness(userId, project);
  const repoSnapshot = buildRepoSnapshot(project);
  const automation = await buildN8nAutomationSnapshot(project);
  const unresolvedMap = new Map<
    string,
    {
      title: string;
      count: number;
      sources: Array<{ id: string; title: string }>;
    }
  >();

  let connectionCount = 0;

  for (const document of docs) {
    const normalizedSelf = normalizeDocumentTitle(document.title);

    for (const link of document.links) {
      const normalizedLink = normalizeDocumentTitle(link);
      const target = docsByTitle.get(normalizedLink);

      if (target && target.id !== document.id) {
        document.outgoingCount += 1;
        target.incomingCount += 1;
        connectionCount += 1;
        continue;
      }

      if (!normalizedLink || normalizedLink === normalizedSelf) {
        continue;
      }

      const unresolved = unresolvedMap.get(normalizedLink);
      if (unresolved) {
        unresolved.count += 1;
        if (!unresolved.sources.some((source) => source.id === document.id)) {
          unresolved.sources.push({ id: document.id, title: document.title });
        }
      } else {
        unresolvedMap.set(normalizedLink, {
          title: link,
          count: 1,
          sources: [{ id: document.id, title: document.title }],
        });
      }
    }
  }

  for (const document of docs) {
    document.degree = document.incomingCount + document.outgoingCount;
  }

  const docsByUpdated = [...docs].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const docsByConnectivity = [...docs].sort((left, right) => {
    if (right.degree !== left.degree) {
      return right.degree - left.degree;
    }

    return (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  });

  const orphanDocs = docs
    .filter((document) => document.degree === 0)
    .sort((left, right) => left.title.localeCompare(right.title));

  const unresolvedTargets = Array.from(unresolvedMap.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.title.localeCompare(right.title);
  });

  const pendingQuests = quests.filter((quest) => !quest.completed);
  const activeQuests = pendingQuests.slice(0, 4);
  const completedQuests = quests
    .filter((quest) => quest.completed)
    .sort((left, right) => {
      const leftDate = new Date(left.completedDate || left.date).getTime();
      const rightDate = new Date(right.completedDate || right.date).getTime();
      return rightDate - leftDate;
    });

  const latestDoc = docsByUpdated[0] || null;
  const latestNote = notes[0] || null;
  const mostConnectedDoc = docsByConnectivity[0] || null;
  const resumeWork: DashboardActionItem[] = [];

  if (latestDoc) {
    resumeWork.push({
      id: `resume-doc-${latestDoc.id}`,
      kind: "doc",
      title: latestDoc.title,
      description: `${latestDoc.links.length} references in the note`,
      href: `/dashboard/docs?doc=${encodeURIComponent(latestDoc.id)}`,
    });
  }

  if (mostConnectedDoc) {
    resumeWork.push({
      id: `resume-graph-${mostConnectedDoc.id}`,
      kind: "graph",
      title: mostConnectedDoc.title,
      description: `Focus graph on degree ${mostConnectedDoc.degree}`,
      href: `/dashboard/graph?focus=${encodeURIComponent(mostConnectedDoc.id)}`,
    });
  }

  if (latestNote) {
    resumeWork.push({
      id: `resume-note-${latestNote.id}`,
      kind: "note",
      title: trimText(latestNote.content, 56) || "Latest note",
      description: latestNote.completed ? "Completed note" : "Open note in stack",
      href: "/dashboard/notes",
    });
  }

  resumeWork.push({
    id: "resume-handoff",
    kind: "handoff",
    title: "Session handoff",
    description:
      repoSnapshot.git.changedFiles.length > 0
        ? `${repoSnapshot.git.changedFiles.length} changed files and ${repoSnapshot.verificationPresets.length} verification commands`
        : "Capture the next step and verification plan for the active repo",
    href: buildPromptPackHref("workspace"),
  });

  const recentActivity: DashboardActivityItem[] = [
    ...docsByUpdated.slice(0, 4).map((document) => ({
      id: `activity-doc-${document.id}`,
      kind: "doc" as const,
      title: `Updated ${document.title}`,
      description: `${document.links.length} references - ${document.tags.slice(0, 2).join(", ") || "doc"}`,
      href: `/dashboard/docs?doc=${encodeURIComponent(document.id)}`,
      timestamp: document.updatedAt,
      tone: "default" as const,
    })),
    ...notes.slice(0, 2).map((note) => ({
      id: `activity-note-${note.id}`,
      kind: "note" as const,
      title: note.completed ? "Checked off note" : "Updated note",
      description: trimText(note.content, 76),
      href: "/dashboard/notes",
      timestamp: note.updatedAt,
      tone: note.completed ? ("success" as const) : ("default" as const),
    })),
    ...completedQuests.slice(0, 2).map((quest) => ({
      id: `activity-quest-${quest.id}`,
      kind: "quest" as const,
      title: "Completed quest",
      description: trimText(quest.goal, 76),
      href: "/dashboard/quests",
      timestamp: quest.completedDate || quest.date,
      tone: "success" as const,
    })),
    ...reports.slice(0, 3).map((report) => ({
      id: `activity-report-${report.id}`,
      kind: "report" as const,
      title: report.title,
      description: `${report.category} - ${report.status}`,
      href: "/dashboard/report",
      timestamp: report.date,
      tone:
        report.status === "success"
          ? ("success" as const)
          : report.status === "warning"
            ? ("warning" as const)
            : ("default" as const),
    })),
  ]
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    )
    .slice(0, 8);

  const suggestions: DashboardSuggestion[] = [];

  if (repoSnapshot.git.available && repoSnapshot.git.isDirty) {
    suggestions.unshift({
      id: "suggest-review-handoff",
      title: "Prepare a handoff from the current diff",
      description: repoSnapshot.git.summary,
      href: buildPromptPackHref("workspace"),
      cta: "Build handoff",
      tone: "primary",
    });
  }

  if (repoSnapshot.verificationPresets.length === 0) {
    suggestions.unshift({
      id: "suggest-add-verification",
      title: "Capture verification commands",
      description: "This project still lacks a stable lint, test, or build command set.",
      href: "/dashboard/docs",
      cta: "Document workflow",
      tone: "warning",
    });
  }

  if (repoSnapshot.codeIntel.overallStatus !== "ready") {
    suggestions.unshift({
      id: "suggest-code-intel",
      title: "Tighten code intelligence",
      description: repoSnapshot.codeIntel.summary,
      href: "/dashboard/automations",
      cta: "Review setup",
      tone:
        repoSnapshot.codeIntel.overallStatus === "missing"
          ? "warning"
          : "secondary",
    });
  }

  if (unresolvedTargets.length > 0) {
    suggestions.push({
      id: "suggest-resolve-links",
      title: "Resolve dangling references",
      description: `${unresolvedTargets.length} unresolved links led by ${unresolvedTargets[0].title}.`,
      href: buildPromptPackHref("workspace"),
      cta: "Generate task",
      tone: "warning",
    });
  }

  if (orphanDocs.length > 0) {
    suggestions.push({
      id: "suggest-connect-orphans",
      title: "Connect isolated docs",
      description: `${orphanDocs.length} docs are detached from the graph.`,
      href: "/dashboard/graph",
      cta: "Open graph",
      tone: "secondary",
    });
  }

  if (activeQuests.length > 0) {
    suggestions.push({
      id: "suggest-advance-quests",
      title: "Advance the active quest stack",
      description: `Start with ${trimText(activeQuests[0].goal, 72)}.`,
      href: buildPromptPackHref("quest_focus", activeQuests[0].id),
      cta: "Generate quest task",
      tone: "primary",
    });
  }

  if (latestDoc) {
    suggestions.push({
      id: "suggest-resume-doc",
      title: "Continue recent document work",
      description: `Resume ${latestDoc.title} or expand its linked notes.`,
      href: buildPromptPackHref("doc_focus", latestDoc.id),
      cta: "Generate doc task",
      tone: "primary",
    });
  }

  if (assistantReadiness.status !== "ready") {
    suggestions.unshift({
      id: "suggest-bootstrap-collaboration",
      title: "Tighten the collaboration scaffold",
      description: assistantReadiness.summary,
      href: "/dashboard/docs",
      cta: "Open docs",
      tone: "secondary",
    });
  }

  const tagCountMap = new Map<string, number>();
  for (const document of docs) {
    for (const tag of document.tags) {
      tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1);
    }
  }
  const topTags = Array.from(tagCountMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const staleDocs = docs
    .filter((document) => {
      const age = now - new Date(document.updatedAt).getTime();
      return age > STALE_THRESHOLD_MS && document.degree > 0;
    })
    .sort((left, right) =>
      new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime(),
    )
    .slice(0, 4);

  const pendingNotes = notes.filter((note) => !note.completed).length;
  const questStatusCounts = questRows.reduce(
    (acc, row) => {
      const status = String((row as { status?: string }).status || (row.completed ? "done" : "open"));
      if (status === "in_progress") acc.inProgress += 1;
      else if (status === "blocked") acc.blocked += 1;
      else if (status === "done") acc.done += 1;
      else acc.open += 1;
      return acc;
    },
    { open: 0, inProgress: 0, blocked: 0, done: 0 },
  );

  const questAreaMap = new Map<string, number>();
  for (const row of questRows) {
    const area = String((row as { area?: string | null }).area || "").trim();
    if (!area) continue;
    questAreaMap.set(area, (questAreaMap.get(area) || 0) + 1);
  }

  const reportAreaMap = new Map<string, number>();
  for (const row of reportRows) {
    const area = String((row as { area?: string | null }).area || "").trim();
    if (!area) continue;
    reportAreaMap.set(area, (reportAreaMap.get(area) || 0) + 1);
  }

  const hour = new Date().getHours();
  let greeting: string;
  if (hour < 6) greeting = "Late night session";
  else if (hour < 12) greeting = "Good morning";
  else if (hour < 17) greeting = "Good afternoon";
  else if (hour < 21) greeting = "Good evening";
  else greeting = "Burning the midnight oil";

  const todayAreaSet = new Set(
    todayReports.map((report) => report.area).filter(Boolean) as string[],
  );

  const nowMs = Date.now();
  const reliabilitySamples: ReliabilitySample[] = reportRowsForToday
    .map((row) => ({ row, metadata: (row as { metadata?: Record<string, unknown> }).metadata || {} }))
    .filter(({ row }) => nowMs - new Date(String(row.date)).getTime() <= 24 * 60 * 60 * 1000)
    .map(({ row, metadata }) => ({
      id: String(row.id),
      timestamp: toIsoString(row.date),
      totalDurationMs: Number(metadata.totalDurationMs ?? metadata.total_duration_ms ?? 0),
      failureClass: String(metadata.failureClass ?? metadata.failure_class ?? "") || null,
      fallbackUsed: Boolean(metadata.fallbackUsed ?? metadata.fallback_used),
    }))
    .filter((sample) => sample.totalDurationMs || sample.failureClass || sample.fallbackUsed)
    .slice(0, 24);

  const reliabilitySummary = evaluateReliability(reliabilitySamples, {
    minSamples: 5,
    maxTimeoutRate: 0.2,
    maxFailoverRate: 0.5,
    maxToolErrorRate: 0.1,
    maxAvgDurationMs: 120000,
  });

  const trend24h = reliabilitySamples.slice(0, 8).map((sample) => ({
    at: sample.timestamp || new Date().toISOString(),
    timeout_rate: sample.failureClass === "timeout" ? 1 : 0,
    failover_rate: sample.fallbackUsed ? 1 : 0,
    tool_error_rate: sample.failureClass === "tool_error" ? 1 : 0,
  }));

  return {
    project: {
      id: project.id,
      name: project.name,
      relativePath: project.relativePath,
    },
    overview: {
      docCount: docs.length,
      noteCount: notes.length,
      connectionCount,
      reportCount: countReports(userId, project.id),
    },
    metrics: {
      openQuests: pendingQuests.length,
      unresolvedLinks: unresolvedTargets.length,
      orphanDocs: orphanDocs.length,
      pendingNotes,
      changedFiles: repoSnapshot.git.changedFiles.length,
    },
    workSummary: {
      questStatusCounts,
      questAreas: Array.from(questAreaMap.entries())
        .map(([area, count]) => ({ area, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
      reportAreas: Array.from(reportAreaMap.entries())
        .map(([area, count]) => ({ area, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
    },
    todayLog: {
      dayKey: todayDayKey,
      entryCount: todayReports.length,
      areas: Array.from(todayAreaSet),
      entries: todayReports.slice(0, 4),
    },
    reliabilityOps: {
      timeout_rate: reliabilitySummary.timeout_rate,
      failover_rate: reliabilitySummary.failover_rate,
      tool_error_rate: reliabilitySummary.tool_error_rate,
      avg_duration_ms: reliabilitySummary.avg_duration_ms,
      sample_size: reliabilitySummary.total,
      status: reliabilitySummary.status,
      trend24h,
    },
    resumeWork,
    activeQuests,
    health: {
      mostConnectedDoc,
      recentlyUpdatedDoc: latestDoc,
      unresolvedTargets: unresolvedTargets.slice(0, 4),
      orphanDocs: orphanDocs.slice(0, 4),
      topTags,
      staleDocs,
    },
    assistantReadiness,
    automation,
    repoSnapshot: {
      project: repoSnapshot.project,
      stack: repoSnapshot.stack,
      dashboardSurfaces: repoSnapshot.dashboardSurfaces,
      scripts: repoSnapshot.scripts,
      verificationPresets: repoSnapshot.verificationPresets,
      codeIntel: repoSnapshot.codeIntel,
      git: repoSnapshot.git,
      hotspots: repoSnapshot.hotspots,
    },
    greeting,
    recentActivity,
    suggestions: suggestions.slice(0, 5),
  };
}
