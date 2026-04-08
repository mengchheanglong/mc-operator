import Database from "better-sqlite3";
import path from "path";
import { mkdirSync, writeFileSync } from "fs";
import { evaluateReliability, type ReliabilitySample } from "../src/server/services/reliability-ops-core.ts";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  const result = {
    ...summary,
    limit,
  };

  const summaryPath = process.env.MISSION_CONTROL_RELIABILITY_SUMMARY_PATH;
  const telemetryPath = process.env.MISSION_CONTROL_RELIABILITY_TELEMETRY_PATH;

  if (summaryPath) {
    mkdirSync(path.dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath, JSON.stringify(result, null, 2));
  }
  if (telemetryPath) {
    mkdirSync(path.dirname(telemetryPath), { recursive: true });
    writeFileSync(telemetryPath, JSON.stringify(samples, null, 2));
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main();
