import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SqliteService } from "../../infra/sqlite/sqlite.service";

type QuestDifficulty = "easy" | "normal" | "hard" | "nightmare" | "hell";
type QuestStatus = "open" | "in_progress" | "blocked" | "done";

interface VerificationCommandEvidence {
  command: string;
  output: string;
  status?: "success" | "warning" | "error";
}

interface VerificationEvidence {
  summary: string;
  commands: VerificationCommandEvidence[];
}

interface QuestRow {
  id: string;
  _id: string;
  userId: string;
  projectId: string;
  goal: string;
  difficulty: QuestDifficulty;
  status: QuestStatus;
  area: string | null;
  topics: string[];
  completed: boolean;
  date: string;
  completedDate: string | null;
}

const DEFAULT_PROJECT_ID = "mission-control";

const DIFFICULTY_SET = new Set<QuestDifficulty>([
  "easy",
  "normal",
  "hard",
  "nightmare",
  "hell",
]);

const STATUS_SET = new Set<QuestStatus>([
  "open",
  "in_progress",
  "blocked",
  "done",
]);

const STATUS_TRANSITIONS: Record<QuestStatus, Set<QuestStatus>> = {
  open: new Set(["in_progress", "blocked", "done"]),
  in_progress: new Set(["blocked", "done", "open"]),
  blocked: new Set(["in_progress", "open"]),
  done: new Set(["in_progress"]),
};

const CURATED_TOPIC_RULES: Array<{ topic: string; patterns: string[] }> = [
  { topic: "n8n", patterns: ["n8n"] },
  { topic: "openclaw", patterns: ["openclaw"] },
  { topic: "codex", patterns: ["codex"] },
  { topic: "prompt-pack", patterns: ["prompt pack", "prompt-pack", "promptpack"] },
  { topic: "graph", patterns: ["graph", "knowledge graph"] },
  { topic: "automation", patterns: ["automation", "automations", "automate"] },
  { topic: "workflow", patterns: ["workflow", "workflows"] },
  { topic: "security", patterns: ["security"] },
  { topic: "dashboard", patterns: ["dashboard"] },
  { topic: "docs", patterns: ["docs", "documentation", "document"] },
  { topic: "quests", patterns: ["quest", "quests"] },
  { topic: "reports", patterns: ["report", "reports"] },
  { topic: "ui", patterns: ["ui", "interface", "frontend"] },
  { topic: "api", patterns: ["api", "apis", "backend"] },
  { topic: "sqlite", patterns: ["sqlite"] },
  { topic: "git", patterns: ["git", "github"] },
  { topic: "mcp", patterns: ["mcp"] },
  { topic: "inbox", patterns: ["inbox"] },
  { topic: "architecture", patterns: ["architecture", "architectural"] },
  { topic: "quality", patterns: ["quality", "lint", "typecheck", "build", "test"] },
  { topic: "ide", patterns: ["ide", "cursor", "editor"] },
  { topic: "codegraphcontext", patterns: ["codegraphcontext", "code graph context", "cgc"] },
];

function normalizeTopicValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[._/]+/g, " ")
    .trim();
}

function normalizeTopics(values: unknown): string[] {
  const source = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(",")
      : [];
  const normalized = source
    .map((value) => normalizeTopicValue(String(value || "")))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeComparableText(value: string) {
  return normalizeTopicValue(value).replace(/-/g, " ");
}

function toSlugTopic(value: string) {
  return normalizeTopicValue(value).replace(/\s+/g, "-");
}

function inferWorkItemTopics(input: {
  goal: string;
  area?: string | null;
  topics?: string[];
}): string[] {
  const explicitTopics = normalizeTopics(input.topics || []);
  if (explicitTopics.length > 0) {
    return explicitTopics;
  }

  const matches = new Set<string>();
  const comparableGoal = normalizeComparableText(input.goal);
  const comparableArea = normalizeComparableText(String(input.area || ""));
  const combined = `${comparableGoal} ${comparableArea}`.trim();

  for (const rule of CURATED_TOPIC_RULES) {
    if (
      rule.patterns.some((pattern) => {
        const comparablePattern = normalizeComparableText(pattern);
        return comparablePattern && combined.includes(comparablePattern);
      })
    ) {
      matches.add(rule.topic);
    }
  }

  const normalizedArea = toSlugTopic(String(input.area || ""));
  if (normalizedArea) {
    matches.add(normalizedArea);
  }

  if (matches.size === 0) {
    const bestPhrase =
      comparableGoal
        .split(/\s+/)
        .filter((part) => part.length > 2)
        .slice(0, 2)
        .join("-") || "general";
    matches.add(bestPhrase);
  }

  return normalizeTopics(Array.from(matches));
}

function normalizeCommandStatus(value: unknown): VerificationCommandEvidence["status"] {
  if (value === "warning" || value === "error") return value;
  return value === "success" ? "success" : undefined;
}

function normalizeVerificationEvidence(input: unknown): VerificationEvidence | null {
  if (!input || typeof input !== "object") return null;
  const row = input as { summary?: unknown; commands?: unknown };
  const summary = String(row.summary || "").trim();
  const commands: VerificationCommandEvidence[] = Array.isArray(row.commands)
    ? row.commands.reduce<VerificationCommandEvidence[]>((acc, item) => {
        if (!item || typeof item !== "object") return acc;
        const command = String((item as { command?: unknown }).command || "").trim();
        const output = String((item as { output?: unknown }).output || "").trim();
        const status = normalizeCommandStatus((item as { status?: unknown }).status);
        if (!command || !output) return acc;
        acc.push({ command, output, status });
        return acc;
      }, [])
    : [];

  if (!summary) return null;
  return { summary, commands };
}

function validateVerificationEvidence(input: unknown): { ok: boolean; reason?: string; value?: VerificationEvidence } {
  const normalized = normalizeVerificationEvidence(input);
  if (!normalized) {
    return { ok: false, reason: "verificationEvidence.summary is required." };
  }

  if (Array.isArray((input as { commands?: unknown })?.commands) && normalized.commands.length === 0) {
    return {
      ok: false,
      reason: "verificationEvidence.commands must include entries with command and output.",
    };
  }

  return { ok: true, value: normalized };
}

@Injectable()
export class QuestsService {
  constructor(private readonly sqlite: SqliteService) {}

  private s(value: unknown) {
    return String(value ?? "").trim();
  }

  private parseTopicsJson(value: unknown): string[] {
    if (typeof value !== "string" || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      return normalizeTopics(parsed);
    } catch {
      return [];
    }
  }

  private normalizeArea(value: unknown) {
    const normalized = this.s(value).toLowerCase().replace(/\s+/g, " ");
    return normalized || null;
  }

  private normalizeDifficulty(value: unknown, fallback: QuestDifficulty): QuestDifficulty {
    const normalized = this.s(value).toLowerCase() as QuestDifficulty;
    if (DIFFICULTY_SET.has(normalized)) return normalized;
    return fallback;
  }

  private normalizeStatus(value: unknown, fallback: QuestStatus): QuestStatus {
    const normalized = this.s(value).toLowerCase() as QuestStatus;
    if (STATUS_SET.has(normalized)) return normalized;
    return fallback;
  }

  private parseOptionalStatus(value: unknown): QuestStatus | null {
    if (value === undefined || value === null) return null;
    const normalized = this.s(value).toLowerCase() as QuestStatus;
    return STATUS_SET.has(normalized) ? normalized : null;
  }

  private parseOptionalDifficulty(value: unknown): QuestDifficulty | null {
    if (value === undefined || value === null) return null;
    const normalized = this.s(value).toLowerCase() as QuestDifficulty;
    return DIFFICULTY_SET.has(normalized) ? normalized : null;
  }

  private operator() {
    const latest = this.sqlite.connection
      .prepare(
        "SELECT id, timezone FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1",
      )
      .get() as Record<string, unknown> | undefined;
    if (latest) {
      return { id: this.s(latest.id) };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare(
        "INSERT INTO users (id, name, timezone, join_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, "Operator", "Asia/Bangkok", now, now, now);
    return { id };
  }

  private resolveProjectId(projectId?: unknown) {
    return this.s(projectId) || DEFAULT_PROJECT_ID;
  }

  private toQuestRow(raw: Record<string, unknown>): QuestRow {
    const id = this.s(raw.id);
    const goal = this.s(raw.goal);
    const area = this.s(raw.area) || null;
    const storedTopics = this.parseTopicsJson(raw.topics_json);
    const topics =
      storedTopics.length > 0
        ? storedTopics
        : inferWorkItemTopics({ goal, area, topics: storedTopics });

    const completed = Boolean(raw.completed);
    const status = (this.s(raw.status) || (completed ? "done" : "open")) as QuestStatus;
    return {
      id,
      _id: id,
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      goal,
      difficulty: this.normalizeDifficulty(raw.difficulty, "normal"),
      status,
      area,
      topics,
      completed,
      date: this.s(raw.date),
      completedDate: this.s(raw.completed_date) || null,
    };
  }

  private findQuestRow(userId: string, projectId: string, id: string) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT * FROM quests WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1",
      )
      .get(userId, projectId, id) as Record<string, unknown> | undefined;
    return row ? this.toQuestRow(row) : undefined;
  }

  private countWithFilter(
    userId: string,
    projectId: string,
    input: { completed?: boolean; status?: QuestStatus; area?: string | null },
  ) {
    const conditions = ["user_id = ?", "project_id = ?"];
    const params: Array<string | number> = [userId, projectId];

    if (typeof input.completed === "boolean") {
      conditions.push("completed = ?");
      params.push(input.completed ? 1 : 0);
    }
    if (input.status) {
      conditions.push("status = ?");
      params.push(input.status);
    }
    if (input.area) {
      conditions.push("area = ?");
      params.push(input.area);
    }

    const row = this.sqlite.connection
      .prepare(`SELECT COUNT(*) AS total FROM quests WHERE ${conditions.join(" AND ")}`)
      .get(...params) as { total?: number } | undefined;
    return Number(row?.total || 0);
  }

  list(input: {
    projectId?: unknown;
    limit?: number;
    skip?: number;
    completed?: boolean;
    status?: QuestStatus;
    area?: string | null;
    withMeta?: boolean;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const now = new Date().toISOString();
    const conditions = ["user_id = ?", "project_id = ?", "date <= ?"];
    const params: Array<string | number> = [user.id, projectId, now];

    if (typeof input.completed === "boolean") {
      conditions.push("completed = ?");
      params.push(input.completed ? 1 : 0);
    }
    if (input.status) {
      conditions.push("status = ?");
      params.push(input.status);
    }
    if (input.area) {
      conditions.push("area = ?");
      params.push(input.area);
    }

    const limit = Math.max(1, Math.min(Number(input.limit || 1000), 1000));
    const skip = Math.max(0, Number(input.skip || 0));
    params.push(limit, skip);

    const rows = this.sqlite.connection
      .prepare(
        `SELECT * FROM quests WHERE ${conditions.join(" AND ")} ORDER BY date DESC LIMIT ? OFFSET ?`,
      )
      .all(...params) as Array<Record<string, unknown>>;
    const quests = rows.map((row) => this.toQuestRow(row));

    if (!input.withMeta) {
      return quests;
    }

    const area = input.area || undefined;
    const status = input.status || undefined;
    const completed = input.completed;
    const total =
      typeof completed === "boolean" && !status && !area
        ? this.countWithFilter(user.id, projectId, { completed })
        : completed === undefined && !status && !area
          ? this.countWithFilter(user.id, projectId, {})
          : this.countWithFilter(user.id, projectId, { completed, status, area: area || null });

    return {
      quests,
      meta: {
        total,
        loaded: quests.length,
        hasMore: skip + quests.length < total,
        completed,
        status,
        area,
        statusCounts: {
          open: this.countWithFilter(user.id, projectId, { status: "open" }),
          in_progress: this.countWithFilter(user.id, projectId, { status: "in_progress" }),
          blocked: this.countWithFilter(user.id, projectId, { status: "blocked" }),
          done: this.countWithFilter(user.id, projectId, { status: "done" }),
        },
      },
    };
  }

  findById(input: { projectId?: unknown; id?: unknown }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Quest ID is required.");
    }
    return this.findQuestRow(user.id, projectId, id) || null;
  }

  create(input: {
    projectId?: unknown;
    goal?: unknown;
    difficulty?: unknown;
    status?: unknown;
    area?: unknown;
    topics?: unknown;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const goal = this.s(input.goal);
    if (!goal) {
      throw new BadRequestException("Goal is required.");
    }
    if (goal.length > 100) {
      throw new BadRequestException("Goal must be 100 characters or less.");
    }

    const difficulty = this.normalizeDifficulty(input.difficulty, "normal");
    const status = this.normalizeStatus(input.status, "open");
    const area = this.normalizeArea(input.area);
    const topics = Array.isArray(input.topics)
      ? input.topics.map((topic) => String(topic || ""))
      : [];
    const normalizedTopics = inferWorkItemTopics({ goal, area, topics });
    const completed = status === "done";
    const now = new Date().toISOString();
    const id = randomUUID();

    this.sqlite.connection
      .prepare(
        "INSERT INTO quests (id, user_id, project_id, goal, difficulty, topics_json, status, area, completed, date, completed_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        user.id,
        projectId,
        goal.slice(0, 100),
        difficulty,
        JSON.stringify(normalizedTopics),
        status,
        area,
        completed ? 1 : 0,
        now,
        completed ? now : null,
      );

    const created = this.findQuestRow(user.id, projectId, id);
    if (!created) {
      throw new BadRequestException("Failed to create quest.");
    }
    return created;
  }

  update(input: {
    projectId?: unknown;
    id?: unknown;
    goal?: unknown;
    difficulty?: unknown;
    status?: unknown;
    area?: unknown;
    topics?: unknown;
    verificationSummary?: unknown;
    verificationEvidence?: unknown;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Quest ID is required.");
    }

    const existing = this.findQuestRow(user.id, projectId, id);
    if (!existing) {
      return null;
    }

    const hasGoal = input.goal !== undefined;
    const nextGoal = hasGoal ? this.s(input.goal) : existing.goal;
    if (hasGoal && !nextGoal) {
      throw new BadRequestException("Goal is required.");
    }
    if (nextGoal.length > 100) {
      throw new BadRequestException("Goal must be 100 characters or less.");
    }

    const parsedDifficulty = this.parseOptionalDifficulty(input.difficulty);
    const parsedStatus = this.parseOptionalStatus(input.status);
    const hasStatusUpdate = parsedStatus !== null;
    const nextStatus = parsedStatus || existing.status;

    let verificationEvidence: VerificationEvidence | null = null;
    if (hasStatusUpdate && nextStatus !== existing.status) {
      const validTransition = STATUS_TRANSITIONS[existing.status]?.has(nextStatus) ?? false;
      if (!validTransition) {
        throw new ConflictException(
          `Invalid quest status transition: ${existing.status} -> ${nextStatus}.`,
        );
      }

      if (nextStatus === "done") {
        const verificationSummary = this.s(input.verificationSummary);
        const evidenceValidation = validateVerificationEvidence(input.verificationEvidence);
        if (evidenceValidation.ok && evidenceValidation.value) {
          verificationEvidence = evidenceValidation.value;
        } else if (verificationSummary) {
          verificationEvidence = { summary: verificationSummary, commands: [] };
        } else {
          throw new BadRequestException(
            evidenceValidation.reason ||
              "verificationSummary or verificationEvidence is required before setting quest status to done.",
          );
        }
      }
    }

    const assignments: string[] = [];
    const params: Array<string | number | null> = [];

    if (hasGoal) {
      assignments.push("goal = ?");
      params.push(nextGoal.slice(0, 100));
    }

    if (parsedDifficulty !== null) {
      assignments.push("difficulty = ?");
      params.push(parsedDifficulty);
    }

    if (hasStatusUpdate) {
      const nextCompleted = nextStatus === "done";
      assignments.push("status = ?");
      params.push(nextStatus);
      assignments.push("completed = ?");
      params.push(nextCompleted ? 1 : 0);
      assignments.push("completed_date = ?");
      params.push(nextCompleted ? existing.completedDate || new Date().toISOString() : null);
    }

    if (input.area !== undefined) {
      assignments.push("area = ?");
      params.push(this.normalizeArea(input.area));
    }

    if (input.topics !== undefined) {
      const topics = Array.isArray(input.topics)
        ? input.topics.map((topic) => String(topic || ""))
        : [];
      assignments.push("topics_json = ?");
      params.push(JSON.stringify(normalizeTopics(topics)));
    }

    if (assignments.length > 0) {
      params.push(user.id, projectId, id);
      this.sqlite.connection
        .prepare(
          `UPDATE quests SET ${assignments.join(", ")} WHERE user_id = ? AND project_id = ? AND id = ?`,
        )
        .run(...params);
    }

    const quest = this.findQuestRow(user.id, projectId, id);
    if (!quest) {
      throw new BadRequestException("Quest not found.");
    }

    return {
      quest,
      transition: {
        from: existing.status,
        to: quest.status,
      },
      verificationEvidence,
    };
  }

  toggleCompletion(input: {
    projectId?: unknown;
    id?: unknown;
    verificationSummary?: unknown;
    verificationEvidence?: unknown;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Quest ID is required.");
    }

    const existing = this.findQuestRow(user.id, projectId, id);
    if (!existing) {
      return null;
    }

    let verificationEvidence: VerificationEvidence | null = null;
    if (!existing.completed) {
      const verificationSummary = this.s(input.verificationSummary);
      const evidenceValidation = validateVerificationEvidence(input.verificationEvidence);
      if (evidenceValidation.ok && evidenceValidation.value) {
        verificationEvidence = evidenceValidation.value;
      } else if (verificationSummary) {
        verificationEvidence = { summary: verificationSummary, commands: [] };
      } else {
        throw new BadRequestException(
          evidenceValidation.reason ||
            "verificationSummary or verificationEvidence is required before completing a quest.",
        );
      }
    }

    const nextCompleted = !existing.completed;
    const completedDate = nextCompleted ? new Date().toISOString() : null;
    const nextStatus: QuestStatus = nextCompleted ? "done" : "open";
    this.sqlite.connection
      .prepare(
        "UPDATE quests SET completed = ?, completed_date = ?, status = ? WHERE user_id = ? AND project_id = ? AND id = ?",
      )
      .run(
        nextCompleted ? 1 : 0,
        completedDate,
        nextStatus,
        user.id,
        projectId,
        id,
      );

    const quest = this.findQuestRow(user.id, projectId, id);
    if (!quest) {
      throw new BadRequestException("Quest not found.");
    }

    return {
      quest,
      verificationEvidence,
    };
  }

  delete(input: { projectId?: unknown; id?: unknown }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Quest ID is required.");
    }

    const result = this.sqlite.connection
      .prepare("DELETE FROM quests WHERE user_id = ? AND project_id = ? AND id = ?")
      .run(user.id, projectId, id);
    return result.changes > 0;
  }
}
