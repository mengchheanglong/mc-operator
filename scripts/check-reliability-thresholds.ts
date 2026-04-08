import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";
import {
  computeFailureWindowKey,
  evaluateReliability,
  type ReliabilitySample,
} from "../src/server/services/reliability-ops-core.ts";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toSample(id: string, timestamp: string, metadata: Record<string, unknown>): ReliabilitySample {
  return {
    id,
    timestamp,
    totalDurationMs: Number(metadata.totalDurationMs ?? metadata.total_duration_ms ?? 0),
    failureClass: String(metadata.failureClass ?? metadata.failure_class ?? "") || null,
    fallbackUsed: Boolean(metadata.fallbackUsed ?? metadata.fallback_used),
  };
}

function resolveUserId(sqlite: Database.Database) {
  const existing = sqlite.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
  if (existing?.id) return existing.id;

  const now = new Date().toISOString();
  const fallbackUserId = "default-user";
  sqlite
    .prepare(`
      INSERT OR IGNORE INTO users (id, name, timezone, join_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(fallbackUserId, "Adventurer", "Asia/Bangkok", now, now, now);

  return fallbackUserId;
}

function resolveProjectId(sqlite: Database.Database) {
  const row = sqlite
    .prepare("SELECT project_id FROM reports WHERE project_id IS NOT NULL AND project_id <> '' ORDER BY date DESC LIMIT 1")
    .get() as { project_id?: string } | undefined;
  return String(row?.project_id || "mission-control");
}

function ensureReliabilityQuestLocal(summary: ReturnType<typeof evaluateReliability>, dbPath: string) {
  const windowKey = computeFailureWindowKey(summary);
  if (summary.ok) return { created: false, questId: null as string | null, windowKey };

  const sqlite = new Database(dbPath);
  try {
    const userId = resolveUserId(sqlite);
    const projectId = resolveProjectId(sqlite);
    const duplicate = sqlite
      .prepare(`
        SELECT id
        FROM quests
        WHERE user_id = ?
          AND project_id = ?
          AND area = 'runtime-reliability'
          AND status = 'open'
          AND goal LIKE ?
        ORDER BY date DESC
        LIMIT 1
      `)
      .get(userId, projectId, `%${windowKey}%`) as { id?: string } | undefined;

    if (duplicate?.id) {
      return { created: false, questId: duplicate.id, windowKey };
    }

    const now = new Date().toISOString();
    const questId = randomUUID();
    const goal = `Reliability remediation ${windowKey}`.slice(0, 100);
    const topicsJson = JSON.stringify(["reliability", "ops", "auto-remediation"]);

    const tx = sqlite.transaction(() => {
      sqlite
        .prepare(`
          INSERT INTO quests (
            id, user_id, project_id, goal, difficulty, status, area, topics_json, completed, date, completed_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          questId,
          userId,
          projectId,
          goal,
          "normal",
          "open",
          "runtime-reliability",
          topicsJson,
          0,
          now,
          null,
        );

      const reportId = randomUUID();
      const metadataJson = JSON.stringify({
        reliability_window: windowKey,
        summary,
        topics: ["reliability", "auto-remediation"],
      });
      const reportContent = [
        `Window: ${windowKey}`,
        `Reasons: ${summary.reasons.join(", ")}`,
        `Sample size: ${summary.total}/${summary.required}`,
        `Top failures: ${summary.top_failure_classes.map((item) => `${item.name}(${item.count})`).join(", ") || "none"}`,
        `Recent failing runs: ${summary.recent_failures.map((item) => `${item.id}${item.timestamp ? `@${item.timestamp}` : ""}`).join(", ") || "none"}`,
        "Suggested next action: inspect failing run traces and tune fallback route thresholds.",
      ].join("\n");

      sqlite
        .prepare(`
          INSERT INTO reports (
            id, user_id, project_id, title, content, category, status, area, linked_quest_id, source, metadata_json, date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          reportId,
          userId,
          projectId,
          "Auto-created reliability remediation quest",
          reportContent,
          "maintenance",
          "warning",
          "runtime-reliability",
          questId,
          "OpenClaw",
          metadataJson,
          now,
        );
    });

    tx();
    return { created: true, questId, windowKey };
  } finally {
    sqlite.close();
  }
}

async function main() {
  const limit = Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_RUN_LIMIT", 20)));
  const softMode = envBool("MISSION_CONTROL_RELIABILITY_SOFT_MODE", false);

  const dbPath = path.resolve(process.env.SQLITE_PATH || path.join(process.cwd(), "data", "openclaw.db"));
  const sqlite = new Database(dbPath, { readonly: true });

  const rows = sqlite
    .prepare("SELECT id, date, metadata_json FROM reports ORDER BY date DESC, id DESC LIMIT ?")
    .all(limit * 8) as Array<{ id: string; date: string; metadata_json: string | null }>;

  sqlite.close();

  const samples = rows
    .map((row) => toSample(row.id, row.date, parseMetadata(row.metadata_json)))
    .filter((sample) => sample.totalDurationMs || sample.failureClass || sample.fallbackUsed)
    .slice(0, limit);

  const summary = evaluateReliability(samples, {
    minSamples: Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_MIN_SAMPLES", 20))),
    maxTimeoutRate: envNum("MISSION_CONTROL_RELIABILITY_MAX_TIMEOUT_RATE", 0.2),
    maxFailoverRate: envNum("MISSION_CONTROL_RELIABILITY_MAX_FAILOVER_RATE", 0.5),
    maxToolErrorRate: envNum("MISSION_CONTROL_RELIABILITY_MAX_TOOL_ERROR_RATE", 0.1),
    maxAvgDurationMs: Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_MAX_AVG_DURATION_MS", 120000))),
  });

  const questState = !summary.ok
    ? ensureReliabilityQuestLocal(summary, dbPath)
    : { created: false, questId: null, windowKey: null };

  const result = {
    ...summary,
    quest_payload: summary.ok
      ? null
      : {
          title: "Investigate Mission Control runtime reliability regression",
          area: "runtime-reliability",
          topics: ["reliability", "openclaw", "telemetry"],
          summary: summary.reasons.join(", "),
          reason: summary.reason,
          top_failure_classes: summary.top_failure_classes,
          sample_size: summary.total,
          recent_failures: summary.recent_failures,
          suggested_next_action: "Inspect failing runs and tune model route policy/fallback thresholds.",
          failure_window: questState.windowKey,
        },
    quest_auto_created: questState.created,
    quest_id: questState.questId || null,
    soft_mode: softMode,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!summary.ok && !softMode) process.exit(1);
}

void main();
