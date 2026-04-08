import fs from "fs";
import path from "path";
import { and, asc, eq } from "drizzle-orm";
import { findUserById } from "@/server/repositories/users-repo";
import { findWorkspaceProject } from "@/server/projects/workspace-projects";
import { db } from "@/server/sqlite/db";
import { parseJsonField } from "@/server/sqlite/json";
import { reports } from "@/server/sqlite/schema";

interface DailyReportEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  area: string | null;
  source: string;
  topics: string[];
  metadata: Record<string, unknown>;
  date: string;
}

export interface DailyReportLogItem {
  dayKey: string;
  title: string;
  content: string;
  preview: string;
  entryCount: number;
  areas: string[];
  topics: string[];
  categories: string[];
  latestDate: string;
}

type DailyReportLogCacheEntry = {
  expiresAt: number;
  items: DailyReportLogItem[];
};

const DAILY_REPORT_LOG_CACHE_TTL_MS = 15000;
const dailyReportLogCache = new Map<string, DailyReportLogCacheEntry>();

function formatDayTitle(dayKey: string, timezone: string) {
  const date = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return `Daily Work Log - ${dayKey}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
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

function formatTimeLabel(dateValue: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(dateValue));
}

function getDailyReportDir(projectId: string) {
  const project = findWorkspaceProject(projectId);
  const rootPath = project?.rootPath || process.cwd();
  return path.join(rootPath, ".openclaw", "context", "daily-reports");
}

function getDailyReportLogCacheKey(userId: string, projectId: string) {
  return `${userId}:${projectId}:readonly`;
}

export function clearDailyReportLogCache(userId?: string, projectId?: string) {
  if (!userId || !projectId) {
    dailyReportLogCache.clear();
    return;
  }

  dailyReportLogCache.delete(getDailyReportLogCacheKey(userId, projectId));
}

function listDailyEntries(userId: string, projectId: string, timezone: string) {
  return db
    .select({
      id: reports.id,
      title: reports.title,
      content: reports.content,
      category: reports.category,
      status: reports.status,
      area: reports.area,
      source: reports.source,
      metadataJson: reports.metadataJson,
      date: reports.date,
    })
    .from(reports)
    .where(
      and(
        eq(reports.userId, userId),
        eq(reports.projectId, projectId),
      ),
    )
    .orderBy(asc(reports.date), asc(reports.id))
    .all()
    .map((row) => {
      const metadata = parseJsonField(row.metadataJson) as {
        topics?: unknown;
      } & Record<string, unknown>;
      return {
        id: row.id,
        dayKey: formatDayKey(row.date, timezone),
        title: row.title,
        content: row.content,
        category: row.category,
        status: row.status,
        area: row.area || null,
        source: row.source,
        topics: Array.isArray(metadata.topics)
          ? metadata.topics.map((topic) => String(topic))
          : [],
        metadata,
        date: row.date,
      } satisfies DailyReportEntry & { dayKey: string };
    });
}

function compareDailyEntries(left: DailyReportEntry, right: DailyReportEntry) {
  const byDate = left.date.localeCompare(right.date);
  if (byDate !== 0) return byDate;
  return left.id.localeCompare(right.id);
}

function firstNonEmptyLine(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
}

function deriveTaskContext(entry: DailyReportEntry) {
  const titleLower = entry.title.toLowerCase();
  const metadata = entry.metadata || {};
  const runContext =
    metadata.runContext && typeof metadata.runContext === "object"
      ? (metadata.runContext as Record<string, unknown>)
      : null;
  const runId = runContext ? String(runContext.runId || "").trim() : "";
  const action = String(metadata.action || "").trim();
  const canary =
    metadata.canary && typeof metadata.canary === "object"
      ? (metadata.canary as Record<string, unknown>)
      : null;
  const canaryAlertType = canary ? String(canary.alertType || "").trim() : "";

  if (titleLower.includes("directive workspace sync")) {
    return "Directive Workspace artifact sync and architecture context capture.";
  }
  if (titleLower.includes("run-scoped agency-agents")) {
    const parts = [
      "Run-scoped agency-agents tool validation.",
      action ? `action=${action}` : "",
      runId ? `runId=${runId}` : "",
    ].filter(Boolean);
    return parts.join(" ");
  }
  if (titleLower.includes("workspace global health")) {
    return "Workspace health sweep across runtime checks and project checks.";
  }
  if (titleLower.includes("nightly canary")) {
    return canaryAlertType === "failure"
      ? "Nightly canary detected failing critical checks."
      : "Nightly canary critical checks passed.";
  }
  if (titleLower.includes("repo sources nightly")) {
    return "Repo-source sync and repo-source health validation.";
  }
  if (titleLower.includes("hotspot follow-up")) {
    return "Nightly hotspot follow-up generation for failing steps.";
  }

  const fallback = [];
  if (entry.area) fallback.push(`area=${entry.area}`);
  fallback.push(`category=${entry.category}`);
  if (runId) fallback.push(`runId=${runId}`);
  return fallback.join(" | ");
}

function buildDailyReportMarkdown(input: {
  projectName: string;
  projectRelativePath: string;
  dayKey: string;
  timezone: string;
  entries: DailyReportEntry[];
}) {
  const areas = Array.from(
    new Set(input.entries.map((entry) => entry.area).filter(Boolean)),
  ) as string[];
  const topics = Array.from(
    new Set(input.entries.flatMap((entry) => entry.topics).filter(Boolean)),
  );
  const categories = Array.from(new Set(input.entries.map((entry) => entry.category)));
  const warningOrError = input.entries.filter(
    (entry) => entry.status === "warning" || entry.status === "error",
  );
  const actionCandidates = input.entries.filter((entry) =>
    ["task", "maintenance", "file", "research"].includes(entry.category),
  );
  const followUpCandidates = input.entries.filter((entry) => {
    const value = entry.content.toLowerCase();
    return (
      entry.status !== "success" ||
      value.includes("follow-up") ||
      value.includes("next step") ||
      value.includes("todo")
    );
  });
  const taskContextCounts = new Map<string, number>();
  for (const entry of input.entries) {
    const context = deriveTaskContext(entry);
    taskContextCounts.set(context, (taskContextCounts.get(context) || 0) + 1);
  }
  const recurringByTitle = Array.from(
    input.entries.reduce((map, entry) => {
      const existing = map.get(entry.title);
      if (existing) {
        existing.push(entry);
      } else {
        map.set(entry.title, [entry]);
      }
      return map;
    }, new Map<string, DailyReportEntry[]>()),
  )
    .filter(([, entries]) => entries.length > 1)
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));

  const lines = [
    `# ${formatDayTitle(input.dayKey, input.timezone)}`,
    "",
    `Project: ${input.projectName}`,
    `Path: ${input.projectRelativePath}`,
    `Timezone: ${input.timezone}`,
    "",
    "## Summary",
    `- Entries: ${input.entries.length}`,
    `- Categories: ${categories.join(", ") || "none"}`,
    `- Areas: ${areas.join(", ") || "none"}`,
    `- Topics: ${topics.join(", ") || "none"}`,
    "",
    "## Task Context",
    ...(taskContextCounts.size > 0
      ? Array.from(taskContextCounts.entries())
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .map(([context, count]) => `- ${context} (${count} entr${count === 1 ? "y" : "ies"})`)
      : ["- No task-context signals detected."]),
    "",
    "## Repeated Events",
    ...(recurringByTitle.length > 0
      ? recurringByTitle.map(([title, entries]) => {
          const sorted = [...entries].sort(compareDailyEntries);
          const first = sorted[0];
          const last = sorted[sorted.length - 1];
          const firstLabel = first ? formatTimeLabel(first.date, input.timezone) : "n/a";
          const lastLabel = last ? formatTimeLabel(last.date, input.timezone) : "n/a";
          return `- ${title} x${entries.length} (${firstLabel} -> ${lastLabel})`;
        })
      : ["- No repeated event titles for this day."]),
    "",
    "## Events",
    ...input.entries.map((entry) => {
      const sourceRef = entry.metadata.sourceRef ? ` (${String(entry.metadata.sourceRef)})` : "";
      return `- ${formatTimeLabel(entry.date, input.timezone)} | ${entry.title} | ${entry.status} | ${entry.source}${sourceRef} | ${deriveTaskContext(entry)}`;
    }),
    "",
    "## Actions",
    ...(actionCandidates.length > 0
      ? actionCandidates.map((entry) => `- ${formatTimeLabel(entry.date, input.timezone)} ${entry.title}`)
      : ["- No explicit action entries logged."]),
    "",
    "## Outcomes",
    ...(warningOrError.length > 0
      ? warningOrError.map((entry) => `- ${entry.status.toUpperCase()}: ${entry.title}`)
      : ["- No warning/error outcomes logged."]),
    "",
    "## Follow-ups",
    ...(followUpCandidates.length > 0
      ? followUpCandidates.map((entry) => {
          const firstLine = firstNonEmptyLine(entry.content) || "Review full entry details.";
          return `- ${entry.title}: ${firstLine}`;
        })
      : ["- No explicit follow-up markers detected."]),
    "",
    "## Entries",
    "",
  ];

  for (const entry of input.entries) {
    lines.push(
      `<!-- REPORT_ENTRY id=${entry.id} ts=${entry.date} source=${entry.source} category=${entry.category} status=${entry.status} -->`,
    );
    lines.push(`### ${formatTimeLabel(entry.date, input.timezone)} - ${entry.title}`);
    lines.push(`- Entry ID: ${entry.id}`);
    lines.push(`- Timestamp: ${entry.date}`);
    lines.push(`- Status: ${entry.status}`);
    lines.push(`- Category: ${entry.category}`);
    lines.push(`- Source: ${entry.source}`);
    lines.push(`- Task Context: ${deriveTaskContext(entry)}`);
    if (entry.area) {
      lines.push(`- Area: ${entry.area}`);
    }
    if (entry.topics.length > 0) {
      lines.push(`- Topics: ${entry.topics.join(", ")}`);
    }
    lines.push("");
    lines.push(entry.content.trim());
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function buildDailyReportContent(input: {
  projectName: string;
  projectRelativePath: string;
  dayKey: string;
  timezone: string;
  entries: DailyReportEntry[];
}) {
  return buildDailyReportMarkdown(input);
}

function buildDailyReportPreview(entry: DailyReportEntry | undefined, timezone: string) {
  if (!entry) {
    return "";
  }

  const lines = [
    `${formatTimeLabel(entry.date, timezone)} - ${entry.title}`,
    `- Entry ID: ${entry.id}`,
    `- Timestamp: ${entry.date}`,
    `- Status: ${entry.status}`,
    `- Category: ${entry.category}`,
    `- Source: ${entry.source}`,
    `- Task Context: ${deriveTaskContext(entry)}`,
  ];

  if (entry.area) {
    lines.push(`- Area: ${entry.area}`);
  }
  if (entry.topics.length > 0) {
    lines.push(`- Topics: ${entry.topics.join(", ")}`);
  }

  lines.push("");
  lines.push(entry.content.trim());

  return lines.join("\n").replace(/\s+/g, " ").trim();
}

export function syncDailyReportLogForDate(userId: string, projectId: string, dateValue: string) {
  const user = findUserById(userId);
  const project = findWorkspaceProject(projectId);
  const timezone = user?.timezone || "Asia/Bangkok";
  const dayKey = formatDayKey(dateValue, timezone);

  const rows = listDailyEntries(userId, projectId, timezone)
    .filter((row) => row.dayKey === dayKey)
    .map(({ dayKey: _dayKey, ...row }) => row)
    .sort(compareDailyEntries);

  const reportDir = getDailyReportDir(projectId);
  const reportPath = path.join(reportDir, `${dayKey}.md`);

  if (rows.length === 0) {
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }
    return;
  }

  ensureDir(reportDir);
  fs.writeFileSync(
    reportPath,
    buildDailyReportMarkdown({
      projectName: project?.name || projectId,
      projectRelativePath: project?.relativePath || projectId,
      dayKey,
      timezone,
      entries: rows,
    }),
    "utf8",
  );
  clearDailyReportLogCache(userId, projectId);
}

export function listDailyReportLogs(
  userId: string,
  projectId: string,
  options?: { materializeFiles?: boolean; includeContent?: boolean },
): DailyReportLogItem[] {
  const user = findUserById(userId);
  const project = findWorkspaceProject(projectId);
  const timezone = user?.timezone || "Asia/Bangkok";
  const reportDir = getDailyReportDir(projectId);
  const materializeFiles = options?.materializeFiles ?? true;
  const includeContent = options?.includeContent ?? true;

  if (!materializeFiles && !includeContent) {
    const cacheKey = getDailyReportLogCacheKey(userId, projectId);
    const cached = dailyReportLogCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.items;
    }
  }

  const rows = listDailyEntries(userId, projectId, timezone);
  const grouped = new Map<string, typeof rows>();

  for (const row of rows) {
    const existing = grouped.get(row.dayKey);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.dayKey, [row]);
    }
  }

  const items = Array.from(grouped.entries())
    .map(([dayKey, entries]) => {
      const sortedEntries = entries.sort((left, right) => compareDailyEntries(left, right));
      const reportPath = path.join(reportDir, `${dayKey}.md`);
      const normalizedEntries = sortedEntries.map(({ dayKey: _dayKey, ...row }) => row);
      const content =
        includeContent || materializeFiles
          ? buildDailyReportContent({
              projectName: project?.name || projectId,
              projectRelativePath: project?.relativePath || projectId,
              dayKey,
              timezone,
              entries: normalizedEntries,
            })
          : "";
      const previewEntry = sortedEntries[0];
      const preview =
        buildDailyReportPreview(previewEntry, timezone) ||
        `${sortedEntries.length} logged updates.`;

      if (materializeFiles) {
        ensureDir(reportDir);
        if (!fs.existsSync(reportPath) || fs.readFileSync(reportPath, "utf8") !== content) {
          fs.writeFileSync(reportPath, content, "utf8");
        }
      }

      const latest = sortedEntries[sortedEntries.length - 1];

      return {
        dayKey,
        title: formatDayTitle(dayKey, timezone),
        content,
        preview,
        entryCount: sortedEntries.length,
        areas: Array.from(new Set(sortedEntries.map((entry) => entry.area).filter(Boolean))) as string[],
        topics: Array.from(new Set(sortedEntries.flatMap((entry) => entry.topics).filter(Boolean))),
        categories: Array.from(new Set(sortedEntries.map((entry) => entry.category))),
        latestDate: latest?.date || `${dayKey}T00:00:00.000Z`,
      } satisfies DailyReportLogItem;
    })
    .sort((left, right) => right.dayKey.localeCompare(left.dayKey));

  if (!materializeFiles && !includeContent) {
    dailyReportLogCache.set(getDailyReportLogCacheKey(userId, projectId), {
      expiresAt: Date.now() + DAILY_REPORT_LOG_CACHE_TTL_MS,
      items,
    });
  }

  return items;
}
