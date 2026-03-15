import Database from "better-sqlite3";
import path from "path";
import {
  ensureReliabilityQuest,
} from "../src/server/services/reliability-ops-service.ts";
import {
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

  const questState = !summary.ok ? ensureReliabilityQuest(summary) : { created: false, quest: null, windowKey: null };

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
    quest_id: questState.quest?.id || null,
    soft_mode: softMode,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!summary.ok && !softMode) process.exit(1);
}

void main();
