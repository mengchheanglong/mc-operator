import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SqliteService } from "../../infra/sqlite/sqlite.service";

const DEFAULT_TIMEZONE = "Asia/Bangkok";
const DEFAULT_PROJECT_ID = "mc-operator";

const REPORT_CATEGORIES = [
  "system",
  "task",
  "chat",
  "file",
  "research",
  "error",
  "maintenance",
] as const;
type ReportCategory = (typeof REPORT_CATEGORIES)[number];

const REPORT_STATUSES = ["info", "success", "warning", "error"] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

const REPORT_AREAS = ["automation", "context", "graph", "ui"] as const;
type ReportArea = (typeof REPORT_AREAS)[number];

interface ReportRow {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  content: string;
  category: string;
  status: string;
  area: string | null;
  linkedQuestId: string | null;
  source: string;
  topics: string[];
  metadata: Record<string, unknown>;
  date: string;
  _id: string;
}

interface DailyReportLogItem {
  dayKey: string;
  title: string;
  content: string;
  entryCount: number;
  areas: string[];
  topics: string[];
  categories: string[];
  latestDate: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly sqlite: SqliteService) {}

  private s(value: unknown) {
    return String(value ?? "").trim();
  }

  private parseMetadata(value: unknown): Record<string, unknown> {
    if (typeof value !== "string" || !value.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
    return {};
  }

  private normalizeTopics(value: unknown) {
    if (!Array.isArray(value)) return [];
    const dedupe = new Set<string>();
    for (const topic of value) {
      const normalized = this.s(topic);
      if (normalized) dedupe.add(normalized);
    }
    return Array.from(dedupe);
  }

  private normalizeArea(value: unknown) {
    const normalized = this.s(value).toLowerCase().replace(/\s+/g, " ");
    return normalized || null;
  }

  private toReportRow(raw: Record<string, unknown>): ReportRow {
    const metadata = this.parseMetadata(raw.metadata_json);
    const topics = this.normalizeTopics(metadata.topics);
    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      title: this.s(raw.title),
      content: this.s(raw.content),
      category: this.s(raw.category),
      status: this.s(raw.status),
      area: this.s(raw.area) || null,
      linkedQuestId: this.s(raw.linked_quest_id) || null,
      source: this.s(raw.source),
      topics,
      metadata,
      date: this.s(raw.date),
      _id: this.s(raw.id),
    };
  }

  private resolveProjectId(projectId?: unknown) {
    return this.s(projectId) || DEFAULT_PROJECT_ID;
  }

  private operator() {
    const latest = this.sqlite.connection
      .prepare(
        "SELECT id, timezone FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1",
      )
      .get() as Record<string, unknown> | undefined;
    if (latest) {
      return {
        id: this.s(latest.id),
        timezone: this.s(latest.timezone) || DEFAULT_TIMEZONE,
      };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare(
        "INSERT INTO users (id, name, timezone, join_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, "Operator", DEFAULT_TIMEZONE, now, now, now);
    return { id, timezone: DEFAULT_TIMEZONE };
  }

  private queryReports(input: {
    projectId?: unknown;
    category?: unknown;
    status?: unknown;
    area?: unknown;
    linkedQuestId?: unknown;
    limit?: number;
    skip?: number;
    allowLargeLimit?: boolean;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const conditions = ["user_id = ?", "project_id = ?"];
    const params: Array<string | number> = [user.id, projectId];

    const category = this.s(input.category);
    if (category) {
      conditions.push("category = ?");
      params.push(category);
    }
    const status = this.s(input.status);
    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }
    const area = this.normalizeArea(input.area);
    if (area) {
      conditions.push("area = ?");
      params.push(area);
    }
    const linkedQuestId = this.s(input.linkedQuestId);
    if (linkedQuestId) {
      conditions.push("linked_quest_id = ?");
      params.push(linkedQuestId);
    }

    const maxLimit = input.allowLargeLimit ? 5000 : 100;
    const limit = Math.max(1, Math.min(Number(input.limit || 50), maxLimit));
    const skip = Math.max(0, Number(input.skip || 0));
    params.push(limit, skip);

    const rows = this.sqlite.connection
      .prepare(
        `SELECT * FROM reports WHERE ${conditions.join(" AND ")} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => this.toReportRow(row));
  }

  private countReports(input: {
    projectId?: unknown;
    category?: unknown;
    status?: unknown;
    area?: unknown;
    linkedQuestId?: unknown;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const conditions = ["user_id = ?", "project_id = ?"];
    const params: string[] = [user.id, projectId];

    const category = this.s(input.category);
    if (category) {
      conditions.push("category = ?");
      params.push(category);
    }
    const status = this.s(input.status);
    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }
    const area = this.normalizeArea(input.area);
    if (area) {
      conditions.push("area = ?");
      params.push(area);
    }
    const linkedQuestId = this.s(input.linkedQuestId);
    if (linkedQuestId) {
      conditions.push("linked_quest_id = ?");
      params.push(linkedQuestId);
    }

    const row = this.sqlite.connection
      .prepare(
        `SELECT COUNT(*) AS total FROM reports WHERE ${conditions.join(" AND ")}`,
      )
      .get(...params) as { total?: number } | undefined;
    return Number(row?.total || 0);
  }

  private dayKeyFromDate(dateValue: string, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(dateValue));

    const year = parts.find((part) => part.type === "year")?.value || "0000";
    const month = parts.find((part) => part.type === "month")?.value || "00";
    const day = parts.find((part) => part.type === "day")?.value || "00";
    return `${year}-${month}-${day}`;
  }

  private dayTitle(dayKey: string, timezone: string) {
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

  private timeLabel(dateValue: string, timezone: string) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(dateValue));
  }

  private deriveTaskContext(entry: ReportRow) {
    const titleLower = entry.title.toLowerCase();
    const metadata = entry.metadata || {};
    const runContext =
      metadata.runContext && typeof metadata.runContext === "object"
        ? (metadata.runContext as Record<string, unknown>)
        : null;
    const runId = runContext ? this.s(runContext.runId) : "";
    const action = this.s(metadata.action);
    const canary =
      metadata.canary && typeof metadata.canary === "object"
        ? (metadata.canary as Record<string, unknown>)
        : null;
    const canaryAlertType = canary ? this.s(canary.alertType) : "";

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

  private buildDailyMarkdown(dayKey: string, timezone: string, entries: ReportRow[]) {
    const categories = Array.from(new Set(entries.map((entry) => entry.category)));
    const areas = Array.from(
      new Set(entries.map((entry) => entry.area).filter(Boolean)),
    ) as string[];
    const topics = Array.from(
      new Set(entries.flatMap((entry) => entry.topics).filter(Boolean)),
    );
    const taskContextCounts = new Map<string, number>();
    for (const entry of entries) {
      const context = this.deriveTaskContext(entry);
      taskContextCounts.set(context, (taskContextCounts.get(context) || 0) + 1);
    }
    const recurringByTitle = Array.from(
      entries.reduce((map, entry) => {
        const existing = map.get(entry.title);
        if (existing) {
          existing.push(entry);
        } else {
          map.set(entry.title, [entry]);
        }
        return map;
      }, new Map<string, ReportRow[]>()),
    )
      .filter(([, groupedEntries]) => groupedEntries.length > 1)
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));
    const lines = [
      `# ${this.dayTitle(dayKey, timezone)}`,
      "",
      "## Summary",
      `- Entries: ${entries.length}`,
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
        ? recurringByTitle.map(([title, groupedEntries]) => {
            const sorted = [...groupedEntries].sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const firstLabel = first ? this.timeLabel(first.date, timezone) : "n/a";
            const lastLabel = last ? this.timeLabel(last.date, timezone) : "n/a";
            return `- ${title} x${groupedEntries.length} (${firstLabel} -> ${lastLabel})`;
          })
        : ["- No repeated event titles for this day."]),
      "",
      "## Events",
      ...entries.map(
        (entry) =>
          `- ${this.timeLabel(entry.date, timezone)} | ${entry.title} | ${entry.status} | ${entry.source} | ${this.deriveTaskContext(entry)}`,
      ),
      "",
      "## Entries",
      "",
    ];

    for (const entry of entries) {
      lines.push(`### ${this.timeLabel(entry.date, timezone)} - ${entry.title}`);
      lines.push(`- Status: ${entry.status}`);
      lines.push(`- Category: ${entry.category}`);
      lines.push(`- Source: ${entry.source}`);
      lines.push(`- Task Context: ${this.deriveTaskContext(entry)}`);
      if (entry.area) {
        lines.push(`- Area: ${entry.area}`);
      }
      if (entry.topics.length > 0) {
        lines.push(`- Topics: ${entry.topics.join(", ")}`);
      }
      lines.push("");
      lines.push(entry.content);
      lines.push("");
    }

    return lines.join("\n").trimEnd() + "\n";
  }

  listDaily(projectId?: unknown): DailyReportLogItem[] {
    const user = this.operator();
    const rows = this.queryReports({
      projectId,
      limit: 5000,
      skip: 0,
      allowLargeLimit: true,
    })
      .slice()
      .sort((left, right) => {
        const byDate = left.date.localeCompare(right.date);
        if (byDate !== 0) return byDate;
        return left.id.localeCompare(right.id);
      });

    const grouped = new Map<string, ReportRow[]>();
    for (const row of rows) {
      const dayKey = this.dayKeyFromDate(row.date, user.timezone);
      const existing = grouped.get(dayKey);
      if (existing) {
        existing.push(row);
      } else {
        grouped.set(dayKey, [row]);
      }
    }

    return Array.from(grouped.entries())
      .map(([dayKey, entries]) => {
        const sortedEntries = [...entries].sort((left, right) => {
          const byDate = left.date.localeCompare(right.date);
          if (byDate !== 0) return byDate;
          return left.id.localeCompare(right.id);
        });
        const latestDate =
          sortedEntries[sortedEntries.length - 1]?.date ||
          `${dayKey}T00:00:00.000Z`;
        return {
          dayKey,
          title: this.dayTitle(dayKey, user.timezone),
          content: this.buildDailyMarkdown(dayKey, user.timezone, sortedEntries),
          entryCount: sortedEntries.length,
          areas: Array.from(
            new Set(sortedEntries.map((entry) => entry.area).filter(Boolean)),
          ) as string[],
          topics: Array.from(
            new Set(sortedEntries.flatMap((entry) => entry.topics).filter(Boolean)),
          ),
          categories: Array.from(
            new Set(sortedEntries.map((entry) => entry.category)),
          ),
          latestDate,
        } satisfies DailyReportLogItem;
      })
      .sort((left, right) => right.dayKey.localeCompare(left.dayKey));
  }

  list(input: {
    projectId?: unknown;
    category?: unknown;
    status?: unknown;
    area?: unknown;
    linkedQuestId?: unknown;
    limit?: number;
    skip?: number;
    withMeta?: boolean;
  }) {
    const reports = this.queryReports(input);
    if (!input.withMeta) {
      return reports;
    }

    const total = this.countReports(input);
    const loaded = reports.length;
    const skip = Math.max(0, Number(input.skip || 0));
    const hasMore = skip + loaded < total;

    const projectId = this.resolveProjectId(input.projectId);
    const categoryCounts = Object.fromEntries(
      REPORT_CATEGORIES.map((category) => [
        category,
        this.countReports({ projectId, category }),
      ]),
    ) as Record<ReportCategory, number>;
    const areaCounts = Object.fromEntries(
      REPORT_AREAS.map((area) => [
        area,
        this.countReports({ projectId, area }),
      ]),
    ) as Record<ReportArea, number>;

    return {
      reports,
      meta: {
        total,
        loaded,
        hasMore,
        categoryCounts,
        areaCounts,
      },
    };
  }

  private normalizeCategory(value: unknown): ReportCategory {
    const normalized = this.s(value).toLowerCase();
    if (!normalized) return "system";
    if (REPORT_CATEGORIES.includes(normalized as ReportCategory)) {
      return normalized as ReportCategory;
    }
    throw new BadRequestException("Category is invalid.");
  }

  private normalizeStatus(value: unknown): ReportStatus {
    const normalized = this.s(value).toLowerCase();
    if (!normalized) return "info";
    if (REPORT_STATUSES.includes(normalized as ReportStatus)) {
      return normalized as ReportStatus;
    }
    throw new BadRequestException("Status is invalid.");
  }

  create(input: {
    projectId?: unknown;
    title?: unknown;
    content?: unknown;
    category?: unknown;
    status?: unknown;
    area?: unknown;
    linkedQuestId?: unknown;
    source?: unknown;
    topics?: unknown;
    metadata?: unknown;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const title = this.s(input.title);
    const content = this.s(input.content);

    if (!title) {
      throw new BadRequestException("Title is required.");
    }
    if (!content) {
      throw new BadRequestException("Content is required.");
    }
    if (title.length > 200) {
      throw new BadRequestException("Title must be 200 characters or less.");
    }
    if (content.length > 5000) {
      throw new BadRequestException("Content must be 5000 characters or less.");
    }

    const category = this.normalizeCategory(input.category);
    const status = this.normalizeStatus(input.status);
    const area = this.normalizeArea(input.area);
    const linkedQuestId = this.s(input.linkedQuestId) || null;
    const source = this.s(input.source) || "OpenClaw";
    const topics = this.normalizeTopics(input.topics);
    const metadata =
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? ({ ...(input.metadata as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const enrichedMetadata = { ...metadata, topics };

    const id = randomUUID();
    const date = new Date().toISOString();
    this.sqlite.connection
      .prepare(
        "INSERT INTO reports (id, user_id, project_id, title, content, category, status, area, linked_quest_id, source, metadata_json, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        user.id,
        projectId,
        title,
        content,
        category,
        status,
        area,
        linkedQuestId,
        source,
        JSON.stringify(enrichedMetadata),
        date,
      );

    const created = this.sqlite.connection
      .prepare("SELECT * FROM reports WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1")
      .get(user.id, projectId, id) as Record<string, unknown> | undefined;
    if (!created) {
      throw new BadRequestException("Failed to create report.");
    }

    return this.toReportRow(created);
  }

  delete(input: { projectId?: unknown; id?: unknown }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Report ID is required.");
    }

    const result = this.sqlite.connection
      .prepare("DELETE FROM reports WHERE user_id = ? AND project_id = ? AND id = ?")
      .run(user.id, projectId, id);

    return result.changes > 0;
  }
}
