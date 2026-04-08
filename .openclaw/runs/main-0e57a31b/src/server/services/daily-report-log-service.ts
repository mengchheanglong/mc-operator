import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { findUserById } from "@/server/repositories/users-repo";
import { findWorkspaceProject } from "@/server/projects/workspace-projects";
import { db } from "@/server/sqlite/db";
import { parseJsonField } from "@/server/sqlite/json";
import { reports } from "@/server/sqlite/schema";

interface DailyReportEntry {
  title: string;
  content: string;
  category: string;
  status: string;
  area: string | null;
  source: string;
  topics: string[];
  date: string;
}

export interface DailyReportLogItem {
  dayKey: string;
  title: string;
  content: string;
  entryCount: number;
  areas: string[];
  topics: string[];
  categories: string[];
  latestDate: string;
}

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

function listDailyEntries(userId: string, projectId: string, timezone: string) {
  return db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.userId, userId),
        eq(reports.projectId, projectId),
      ),
    )
    .all()
    .map((row) => {
      const metadata = parseJsonField(row.metadataJson) as { topics?: unknown };
      return {
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
        date: row.date,
      } satisfies DailyReportEntry & { dayKey: string };
    });
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
    "## Entries",
    "",
  ];

  for (const entry of input.entries) {
    lines.push(`### ${formatTimeLabel(entry.date, input.timezone)} - ${entry.title}`);
    lines.push(`- Status: ${entry.status}`);
    lines.push(`- Category: ${entry.category}`);
    lines.push(`- Source: ${entry.source}`);
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

export function syncDailyReportLogForDate(userId: string, projectId: string, dateValue: string) {
  const user = findUserById(userId);
  const project = findWorkspaceProject(projectId);
  const timezone = user?.timezone || "Asia/Bangkok";
  const dayKey = formatDayKey(dateValue, timezone);

  const rows = listDailyEntries(userId, projectId, timezone)
    .filter((row) => row.dayKey === dayKey)
    .map(({ dayKey: _dayKey, ...row }) => row)
    .sort((left, right) => left.date.localeCompare(right.date));

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
}

export function listDailyReportLogs(userId: string, projectId: string): DailyReportLogItem[] {
  const user = findUserById(userId);
  const project = findWorkspaceProject(projectId);
  const timezone = user?.timezone || "Asia/Bangkok";
  const rows = listDailyEntries(userId, projectId, timezone);
  const reportDir = getDailyReportDir(projectId);

  const grouped = new Map<string, typeof rows>();

  for (const row of rows) {
    const existing = grouped.get(row.dayKey);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.dayKey, [row]);
    }
  }

  return Array.from(grouped.entries())
    .map(([dayKey, entries]) => {
      const sortedEntries = entries.sort((left, right) => left.date.localeCompare(right.date));
      const reportPath = path.join(reportDir, `${dayKey}.md`);
      const content = buildDailyReportContent({
        projectName: project?.name || projectId,
        projectRelativePath: project?.relativePath || projectId,
        dayKey,
        timezone,
        entries: sortedEntries.map(({ dayKey: _dayKey, ...row }) => row),
      });

      ensureDir(reportDir);
      if (!fs.existsSync(reportPath) || fs.readFileSync(reportPath, "utf8") !== content) {
        fs.writeFileSync(reportPath, content, "utf8");
      }

      const latest = sortedEntries[sortedEntries.length - 1];

      return {
        dayKey,
        title: formatDayTitle(dayKey, timezone),
        content,
        entryCount: sortedEntries.length,
        areas: Array.from(new Set(sortedEntries.map((entry) => entry.area).filter(Boolean))) as string[],
        topics: Array.from(new Set(sortedEntries.flatMap((entry) => entry.topics).filter(Boolean))),
        categories: Array.from(new Set(sortedEntries.map((entry) => entry.category))),
        latestDate: latest?.date || `${dayKey}T00:00:00.000Z`,
      } satisfies DailyReportLogItem;
    })
    .sort((left, right) => right.dayKey.localeCompare(left.dayKey));
}
