import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildNightlyOpsBundlePayload,
  isOpsHealthSnapshotLastStep,
  type NightlyOpsBundleStepResult,
} from "../src/server/services/nightly-ops-bundle-core.ts";

function compact(text: string, maxLen: number) {
  const value = String(text || "").trim();
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`;
}

function runStep(
  id: string,
  command: string,
  timeoutMs = 15 * 60 * 1000,
  env?: Record<string, string>,
): NightlyOpsBundleStepResult {
  const startedAt = Date.now();
  const proc = spawnSync(command, {
    shell: true,
    windowsHide: true,
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, ...(env || {}) },
  });
  const exitCode = proc.status ?? 1;
  return {
    id,
    command,
    ok: exitCode === 0,
    exitCode,
    durationMs: Date.now() - startedAt,
    stdout: compact(String(proc.stdout || ""), 2000),
    stderr: compact(String(proc.stderr || ""), 1200),
  };
}

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function lockFilePath(reportsDir: string) {
  return path.join(reportsDir, "nightly-ops-bundle.lock");
}

function acquireLock(reportsDir: string) {
  const lockPath = lockFilePath(reportsDir);
  const staleMs = 6 * 60 * 60 * 1000;
  if (existsSync(lockPath)) {
    try {
      let shouldClear = false;
      const raw = readFileSync(lockPath, "utf8").trim();
      const pidRaw = raw.split(":")[0] || "";
      const pid = Number(pidRaw);
      if (Number.isFinite(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
        } catch {
          shouldClear = true;
        }
      }

      const stats = statSync(lockPath);
      if (Date.now() - stats.mtimeMs > staleMs) {
        shouldClear = true;
      }
      if (shouldClear) {
        unlinkSync(lockPath);
      }
    } catch {}
  }

  try {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, `${process.pid}:${new Date().toISOString()}`, "utf8");
    return { ok: true as const, fd, lockPath };
  } catch {
    return { ok: false as const, lockPath };
  }
}

function main() {
  const startedAt = new Date();
  const reportsDir = path.join(process.cwd(), "reports", "ops");
  mkdirSync(reportsDir, { recursive: true });
  const lock = acquireLock(reportsDir);
  if (!lock.ok) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, skipped: true, reason: "nightly_bundle_in_progress", lockPath: lock.lockPath }, null, 2)}\n`,
    );
    return;
  }

  try {
    const steps = [
      runStep("repo_sources_nightly", "npm run ops:repo-sources:nightly"),
      runStep(
        "canary_nightly",
        "npm run canary:nightly",
        15 * 60 * 1000,
        { MISSION_CONTROL_RELIABILITY_SOFT_MODE: "true" },
      ),
      runStep("workspace_health_nightly", "npm run ops:workspace-health-nightly"),
      runStep("orchestrator_nightly", "npm run ops:orchestrator-nightly"),
    ];
    const stamp = toTimestampForFile(startedAt);
    const timestamped = path.join(reportsDir, `nightly-ops-bundle-${stamp}.json`);
    const latest = path.join(reportsDir, "nightly-ops-bundle-latest.json");
    const writeBundleReport = () => {
      const payload = buildNightlyOpsBundlePayload({
        startedAt,
        steps,
      });
      const serialized = `${JSON.stringify(payload, null, 2)}\n`;
      writeFileSync(timestamped, serialized, "utf8");
      writeFileSync(latest, serialized, "utf8");
      return payload;
    };

    // Persist the core bundle first so ops health can read the current "latest" bundle state.
    writeBundleReport();
    steps.push(runStep("ops_health_snapshot", "npm run ops:health:snapshot"));
    if (!isOpsHealthSnapshotLastStep(steps)) {
      steps.push({
        id: "ops_health_snapshot_order_guard",
        command: "internal.guard",
        ok: false,
        exitCode: 1,
        durationMs: 0,
        stdout: "",
        stderr: "ops_health_snapshot must be the final nightly step",
      });
    }
    const finalPayload = writeBundleReport();
    const nightlySummary = runStep("ops_nightly_summary", "npm run ops:nightly:summary", 2 * 60 * 1000);
    const nightlyHotspots = runStep("ops_nightly_hotspots", "npm run ops:nightly:hotspots", 2 * 60 * 1000);
    const nightlyHotspotSummary = runStep("ops_nightly_hotspot_summary", "npm run ops:nightly:hotspots:summary", 2 * 60 * 1000);
    const nightlyHotspotAlerts = runStep("ops_nightly_hotspot_alerts", "npm run ops:nightly:hotspots:alerts", 2 * 60 * 1000);
    const nightlyHotspotFollowup = runStep("ops_nightly_hotspot_followup", "npm run ops:nightly:hotspots:followup", 2 * 60 * 1000);
    const workflowDoctrineLint = runStep("directive_workflow_doctrine_lint", "npm run check:directive-workflow-doctrine", 2 * 60 * 1000);
    // Keep pruning last so every nightly artifact is written before retention runs.
    const pruneReports = runStep("ops_report_prune", "npm run ops:report:prune", 2 * 60 * 1000);

    process.stdout.write(
      `${JSON.stringify({
        ok: finalPayload.ok,
        failedCount: finalPayload.failedCount,
        reports: { timestamped, latest },
        summaryReportOk: nightlySummary.ok,
        hotspotReportOk: nightlyHotspots.ok,
        hotspotSummaryOk: nightlyHotspotSummary.ok,
        hotspotAlertsOk: nightlyHotspotAlerts.ok,
        hotspotFollowupOk: nightlyHotspotFollowup.ok,
        workflowDoctrineLintOk: workflowDoctrineLint.ok,
        pruneReportOk: pruneReports.ok,
      }, null, 2)}\n`,
    );
    if (!finalPayload.ok) process.exit(1);
  } finally {
    try {
      closeSync(lock.fd);
    } catch {}
    try {
      unlinkSync(lock.lockPath);
    } catch {}
  }
}

main();
