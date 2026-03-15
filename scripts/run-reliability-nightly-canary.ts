import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import crypto from "crypto";

type Sample = {
  id: string;
  timestamp: string;
  totalDurationMs: number;
  failureClass: string | null;
  fallbackUsed: boolean;
};

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function evaluate(samples: Sample[], minSamples: number) {
  const total = samples.length;
  const timeoutCount = samples.filter((sample) => sample.failureClass === "timeout").length;
  const failoverCount = samples.filter((sample) => sample.fallbackUsed).length;
  const toolErrorCount = samples.filter((sample) => sample.failureClass === "tool_error").length;
  const avgDurationMs = total > 0
    ? Math.round(samples.reduce((sum, sample) => sum + sample.totalDurationMs, 0) / total)
    : 0;

  const timeoutRate = total > 0 ? timeoutCount / total : 0;
  const failoverRate = total > 0 ? failoverCount / total : 0;
  const toolErrorRate = total > 0 ? toolErrorCount / total : 0;

  const status = total < minSamples
    ? "insufficient_data"
    : timeoutRate > 0.2 || failoverRate > 0.5 || toolErrorRate > 0.1 || avgDurationMs > 120000
      ? "degraded"
      : "healthy";

  return {
    ok: status === "healthy",
    status,
    total,
    timeout_rate: Number(timeoutRate.toFixed(3)),
    failover_rate: Number(failoverRate.toFixed(3)),
    tool_error_rate: Number(toolErrorRate.toFixed(3)),
    avg_duration_ms: avgDurationMs,
  };
}

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function main() {
  const minSamples = Math.max(1, Math.floor(envNum("MISSION_CONTROL_RELIABILITY_MIN_SAMPLES", 20)));
  const dbPath = path.resolve(process.env.SQLITE_PATH || path.join(process.cwd(), "data", "openclaw.db"));
  const db = new Database(dbPath);

  const userId = (db.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined)?.id || "default-user";
  const projectId = "mission-control";

  const canaryDispatches = [
    { id: "canary-success", failureClass: null, fallbackUsed: false, totalDurationMs: 1200, status: "success" },
    { id: "canary-fallback-success", failureClass: null, fallbackUsed: true, totalDurationMs: 1800, status: "warning" },
    { id: "canary-timeout", failureClass: "timeout", fallbackUsed: false, totalDurationMs: 120000, status: "error" },
    { id: "canary-tool-error", failureClass: "tool_error", fallbackUsed: false, totalDurationMs: 700, status: "error" },
    { id: "canary-provider-error", failureClass: "provider_error", fallbackUsed: true, totalDurationMs: 2500, status: "error" },
  ] as const;

  const insert = db.prepare(`
    INSERT INTO reports (id, user_id, project_id, title, content, category, status, area, linked_quest_id, source, metadata_json, date)
    VALUES (@id, @user_id, @project_id, @title, @content, @category, @status, @area, @linked_quest_id, @source, @metadata_json, @date)
  `);

  const samples: Sample[] = [];
  const tx = db.transaction(() => {
    canaryDispatches.forEach((dispatch, index) => {
      const timestamp = nowIso(index * 1000);
      const reportId = `report-${crypto.randomUUID()}`;
      const metadata = {
        canary: true,
        dispatch_id: dispatch.id,
        timestamp,
        endpoint: "/ops/nightly-canary",
        source: "ops-canary",
        success: dispatch.failureClass === null,
        failure_class: dispatch.failureClass,
        attempts: 1,
        total_duration_ms: dispatch.totalDurationMs,
        model_used: dispatch.fallbackUsed ? "fallback-model" : "primary-model",
        fallback_used: dispatch.fallbackUsed,
      };

      insert.run({
        id: reportId,
        user_id: userId,
        project_id: projectId,
        title: `Nightly reliability canary: ${dispatch.id}`,
        content: `Deterministic canary dispatch ${dispatch.id}`,
        category: "maintenance",
        status: dispatch.status,
        area: "runtime-reliability",
        linked_quest_id: null,
        source: "ops-canary",
        metadata_json: JSON.stringify(metadata),
        date: timestamp,
      });

      samples.push({
        id: reportId,
        timestamp,
        totalDurationMs: dispatch.totalDurationMs,
        failureClass: dispatch.failureClass,
        fallbackUsed: dispatch.fallbackUsed,
      });
    });
  });

  tx();
  db.close();

  const summary = evaluate(samples, minSamples);
  const reportsDir = path.join(process.cwd(), "reports", "ops");
  mkdirSync(reportsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(reportsDir, `nightly-canary-${stamp}.json`);
  const mdPath = path.join(reportsDir, `nightly-canary-${stamp}.md`);

  writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), summary, samples }, null, 2));
  writeFileSync(
    mdPath,
    [
      "# Reliability Nightly Canary",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Status: ${summary.status}`,
      `Samples: ${summary.total}`,
      `Timeout rate: ${summary.timeout_rate}`,
      `Failover rate: ${summary.failover_rate}`,
      `Tool error rate: ${summary.tool_error_rate}`,
      `Avg duration ms: ${summary.avg_duration_ms}`,
      "",
      "## Deterministic dispatches",
      ...samples.map((sample) => `- ${sample.id}: failure=${sample.failureClass || "none"}, fallback=${String(sample.fallbackUsed)}, duration=${sample.totalDurationMs}`),
    ].join("\n"),
  );

  process.stdout.write(`${JSON.stringify({ ok: true, jsonPath, mdPath, summary }, null, 2)}\n`);
}

void main();
