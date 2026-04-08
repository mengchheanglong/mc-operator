import { and, asc, eq } from "drizzle-orm";
import { findUserById } from "@/server/repositories/users-repo";
import { findWorkspaceProject } from "@/server/projects/workspace-projects";
import { db } from "@/server/sqlite/db";
import { parseJsonField } from "@/server/sqlite/json";
import { reports } from "@/server/sqlite/schema";
import { listDailyReportLogs } from "@/server/services/daily-report-log-service";
import { clearDailyReportLogCache } from "@/server/services/daily-report-log-service";
import { resolveUserContext } from "@/server/context/user-context";

type BenchmarkRun = {
  ms: number;
};

type LegacyDailyReportEntry = {
  id: string;
  dayKey: string;
  title: string;
  content: string;
  category: string;
  status: string;
  area: string | null;
  source: string;
  topics: string[];
  metadata: Record<string, unknown>;
  date: string;
};

function averageMs(runs: BenchmarkRun[]) {
  return runs.reduce((sum, run) => sum + run.ms, 0) / runs.length;
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

function formatTimeLabel(dateValue: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(dateValue));
}

function compareDailyEntries(
  left: Pick<LegacyDailyReportEntry, "date" | "id">,
  right: Pick<LegacyDailyReportEntry, "date" | "id">,
) {
  const byDate = left.date.localeCompare(right.date);
  if (byDate !== 0) {
    return byDate;
  }
  return left.id.localeCompare(right.id);
}

function deriveTaskContext(entry: LegacyDailyReportEntry) {
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
  if (entry.area) {
    fallback.push(`area=${entry.area}`);
  }
  fallback.push(`category=${entry.category}`);
  if (runId) {
    fallback.push(`runId=${runId}`);
  }
  return fallback.join(" | ");
}

function buildDailyReportPreview(
  entry: Pick<
    LegacyDailyReportEntry,
    "date" | "title" | "id" | "status" | "category" | "source" | "area" | "topics" | "content" | "metadata"
  > | undefined,
  timezone: string,
) {
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
    `- Task Context: ${deriveTaskContext(entry as LegacyDailyReportEntry)}`,
  ];

  if (entry.area) {
    lines.push(`- Area: ${entry.area}`);
  }
  if (entry.topics.length > 0) {
    lines.push(`- Topics: ${entry.topics.join(", ")}`);
  }

  lines.push("");
  lines.push(entry.content.trim());

  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function listDailyEntriesLegacy(userId: string, projectId: string, timezone: string) {
  return db
    .select()
    .from(reports)
    .where(and(eq(reports.userId, userId), eq(reports.projectId, projectId)))
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
      } satisfies LegacyDailyReportEntry;
    });
}

function listDailyReportLogsLegacyReadonly(userId: string, projectId: string) {
  const user = findUserById(userId);
  const project = findWorkspaceProject(projectId);
  const timezone = user?.timezone || "Asia/Bangkok";
  const rows = listDailyEntriesLegacy(userId, projectId, timezone);
  const grouped = new Map<string, LegacyDailyReportEntry[]>();

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
      const sortedEntries = entries.sort(compareDailyEntries);
      const previewEntry = sortedEntries[0];
      const preview =
        buildDailyReportPreview(previewEntry, timezone) ||
        `${sortedEntries.length} logged updates.`;
      const latest = sortedEntries[sortedEntries.length - 1];

      return {
        dayKey,
        title: formatDayTitle(dayKey, timezone),
        content: "",
        preview,
        entryCount: sortedEntries.length,
        areas: Array.from(
          new Set(sortedEntries.map((entry) => entry.area).filter(Boolean)),
        ) as string[],
        topics: Array.from(
          new Set(sortedEntries.flatMap((entry) => entry.topics).filter(Boolean)),
        ),
        categories: Array.from(new Set(sortedEntries.map((entry) => entry.category))),
        latestDate: latest?.date || `${dayKey}T00:00:00.000Z`,
      };
    })
    .sort((left, right) => right.dayKey.localeCompare(left.dayKey));
}

function logsMatch(
  left: ReturnType<typeof listDailyReportLogsLegacyReadonly>,
  right: ReturnType<typeof listDailyReportLogs>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const { id: userId } = await resolveUserContext();
  const projectId = "mission-control";

  const baselineLogs = listDailyReportLogsLegacyReadonly(userId, projectId);
  const optimizedLogs = listDailyReportLogs(userId, projectId, {
    materializeFiles: false,
    includeContent: false,
  });

  if (!logsMatch(baselineLogs, optimizedLogs)) {
    throw new Error("optimized daily report readonly logs diverged from legacy output");
  }

  const legacyRuns: BenchmarkRun[] = [];
  const optimizedRuns: BenchmarkRun[] = [];

  clearDailyReportLogCache(userId, projectId);
  listDailyReportLogs(userId, projectId, {
    materializeFiles: false,
    includeContent: false,
  });

  for (let index = 0; index < iterations; index += 1) {
    const legacyStarted = performance.now();
    listDailyReportLogsLegacyReadonly(userId, projectId);
    legacyRuns.push({ ms: performance.now() - legacyStarted });

    const optimizedStarted = performance.now();
    listDailyReportLogs(userId, projectId, {
      materializeFiles: false,
      includeContent: false,
    });
    optimizedRuns.push({ ms: performance.now() - optimizedStarted });
  }

  const legacyAvg = averageMs(legacyRuns);
  const optimizedAvg = averageMs(optimizedRuns);

  console.log(
    JSON.stringify(
      {
        projectId,
        iterations,
        parity: {
          ok: true,
          reportLogCount: optimizedLogs.length,
          previewLength: optimizedLogs[0]?.preview.length ?? 0,
        },
        legacyRuns,
        optimizedRuns,
        legacyAvgMs: Number(legacyAvg.toFixed(2)),
        optimizedAvgMs: Number(optimizedAvg.toFixed(2)),
        deltaMs: Number((optimizedAvg - legacyAvg).toFixed(2)),
        improvementPercent: Number(
          (((legacyAvg - optimizedAvg) / legacyAvg) * 100).toFixed(1),
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
