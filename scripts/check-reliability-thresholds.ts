import Database from "better-sqlite3";
import path from "path";

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

function envBool(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

async function main() {
  const limit = Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_RUN_LIMIT", 20)));
  const minSamples = Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_MIN_SAMPLES", 20)));
  const maxTimeoutRate = envNum("MISSION_CONTROL_RELIABILITY_MAX_TIMEOUT_RATE", 0.2);
  const maxFailoverRate = envNum("MISSION_CONTROL_RELIABILITY_MAX_FAILOVER_RATE", 0.5);
  const maxToolErrorRate = envNum("MISSION_CONTROL_RELIABILITY_MAX_TOOL_ERROR_RATE", 0.1);
  const maxAvgDurationMs = Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_MAX_AVG_DURATION_MS", 120000)));
  const softMode = envBool("MISSION_CONTROL_RELIABILITY_SOFT_MODE", false);

  const dbPath = path.resolve(process.env.SQLITE_PATH || path.join(process.cwd(), "data", "openclaw.db"));
  const sqlite = new Database(dbPath, { readonly: true });

  const rows = sqlite
    .prepare("SELECT id, metadata_json FROM reports ORDER BY date DESC, id DESC LIMIT ?")
    .all(limit * 5) as Array<{ id: string; metadata_json: string | null }>;

  sqlite.close();

  const samples = rows
    .map((row) => ({ id: row.id, metadata: parseMetadata(row.metadata_json) }))
    .filter(({ metadata }) =>
      typeof metadata.totalDurationMs === "number"
      || typeof metadata.total_duration_ms === "number"
      || typeof metadata.failureClass === "string"
      || typeof metadata.failure_class === "string"
      || typeof metadata.fallbackUsed === "boolean"
      || typeof metadata.fallback_used === "boolean",
    )
    .slice(0, limit);

  const total = samples.length;
  const timeoutRate = total > 0
    ? samples.filter(({ metadata }) => (metadata.failureClass || metadata.failure_class) === "timeout").length / total
    : 0;
  const failoverRate = total > 0
    ? samples.filter(({ metadata }) => Boolean(metadata.fallbackUsed ?? metadata.fallback_used)).length / total
    : 0;
  const toolErrorRate = total > 0
    ? samples.filter(({ metadata }) => (metadata.failureClass || metadata.failure_class) === "tool_error").length / total
    : 0;
  const avgDurationMs = total > 0
    ? Math.round(
        samples.reduce(
          (sum, { metadata }) => sum + asNumber(metadata.totalDurationMs ?? metadata.total_duration_ms, 0),
          0,
        ) / total,
      )
    : 0;

  const reasons: string[] = [];
  if (total < minSamples) reasons.push("insufficient_data");
  if (timeoutRate > maxTimeoutRate) reasons.push("timeout_rate_exceeded");
  if (failoverRate > maxFailoverRate) reasons.push("failover_rate_exceeded");
  if (toolErrorRate > maxToolErrorRate) reasons.push("tool_error_rate_exceeded");
  if (avgDurationMs > maxAvgDurationMs) reasons.push("avg_duration_exceeded");

  const ok = reasons.length === 0;
  const reason = reasons[0] || "ok";

  const result = {
    ok,
    reason,
    total,
    required: minSamples,
    timeout_rate: Number(timeoutRate.toFixed(3)),
    failover_rate: Number(failoverRate.toFixed(3)),
    tool_error_rate: Number(toolErrorRate.toFixed(3)),
    avg_duration_ms: avgDurationMs,
    thresholds: {
      minSamples,
      maxTimeoutRate,
      maxFailoverRate,
      maxToolErrorRate,
      maxAvgDurationMs,
    },
    reasons,
    quest_payload: ok
      ? null
      : {
          title: "Investigate Mission Control runtime reliability regression",
          area: "runtime-reliability",
          topics: ["reliability", "openclaw", "telemetry"],
          summary: reasons.join(", "),
          reason,
        },
    soft_mode: softMode,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!ok && !softMode) process.exit(1);
}

void main();
