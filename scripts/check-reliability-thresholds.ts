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

async function main() {
  const limit = Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_RUN_LIMIT", 20)));
  const maxTimeoutRate = envNum("MISSION_CONTROL_RELIABILITY_MAX_TIMEOUT_RATE", 0.2);
  const maxFailoverRate = envNum("MISSION_CONTROL_RELIABILITY_MAX_FAILOVER_RATE", 0.5);
  const maxToolErrorRate = envNum("MISSION_CONTROL_RELIABILITY_MAX_TOOL_ERROR_RATE", 0.1);
  const maxAvgDurationMs = Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_MAX_AVG_DURATION_MS", 120000)));

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
      || typeof metadata.failureClass === "string"
      || typeof metadata.fallbackUsed === "boolean",
    )
    .slice(0, limit);

  const total = samples.length;
  const timeoutRate = total > 0 ? samples.filter(({ metadata }) => metadata.failureClass === "timeout").length / total : 0;
  const failoverRate = total > 0 ? samples.filter(({ metadata }) => Boolean(metadata.fallbackUsed)).length / total : 0;
  const toolErrorRate = total > 0 ? samples.filter(({ metadata }) => metadata.failureClass === "tool_error").length / total : 0;
  const avgDurationMs = total > 0
    ? Math.round(samples.reduce((sum, { metadata }) => sum + Number(metadata.totalDurationMs || 0), 0) / total)
    : 0;

  const reasons: string[] = [];
  if (timeoutRate > maxTimeoutRate) reasons.push("timeout_rate_exceeded");
  if (failoverRate > maxFailoverRate) reasons.push("failover_rate_exceeded");
  if (toolErrorRate > maxToolErrorRate) reasons.push("tool_error_rate_exceeded");
  if (avgDurationMs > maxAvgDurationMs) reasons.push("avg_duration_exceeded");

  const result = {
    ok: reasons.length === 0,
    total,
    timeout_rate: Number(timeoutRate.toFixed(3)),
    failover_rate: Number(failoverRate.toFixed(3)),
    tool_error_rate: Number(toolErrorRate.toFixed(3)),
    avg_duration_ms: avgDurationMs,
    thresholds: {
      maxTimeoutRate,
      maxFailoverRate,
      maxToolErrorRate,
      maxAvgDurationMs,
    },
    reasons,
    quest_payload: reasons.length === 0
      ? null
      : {
          title: "Investigate Mission Control runtime reliability regression",
          area: "runtime-reliability",
          topics: ["reliability", "openclaw", "telemetry"],
          summary: reasons.join(", "),
        },
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

void main();
