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
  const dbPath = path.resolve(process.env.SQLITE_PATH || path.join(process.cwd(), "data", "openclaw.db"));
  const sqlite = new Database(dbPath, { readonly: true });

  const rows = sqlite
    .prepare("SELECT id, metadata_json FROM reports ORDER BY date DESC, id DESC LIMIT ?")
    .all(limit * 5) as Array<{ id: string; metadata_json: string | null }>;

  const samples = rows
    .map((row) => ({ id: row.id, metadata: parseMetadata(row.metadata_json) }))
    .filter(({ metadata }) =>
      typeof metadata.totalDurationMs === "number"
      || typeof metadata.failureClass === "string"
      || typeof metadata.fallbackUsed === "boolean",
    )
    .slice(0, limit);

  sqlite.close();

  const total = samples.length;
  const timeoutCount = samples.filter(({ metadata }) => metadata.failureClass === "timeout").length;
  const fallbackCount = samples.filter(({ metadata }) => Boolean(metadata.fallbackUsed)).length;
  const toolErrorCount = samples.filter(({ metadata }) => metadata.failureClass === "tool_error").length;
  const avgDurationMs = total > 0
    ? Math.round(samples.reduce((sum, { metadata }) => sum + Number(metadata.totalDurationMs || 0), 0) / total)
    : 0;

  const result = {
    ok: true,
    total,
    limit,
    timeout_rate: total > 0 ? Number((timeoutCount / total).toFixed(3)) : 0,
    failover_rate: total > 0 ? Number((fallbackCount / total).toFixed(3)) : 0,
    tool_error_rate: total > 0 ? Number((toolErrorCount / total).toFixed(3)) : 0,
    avg_duration_ms: avgDurationMs,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main();
