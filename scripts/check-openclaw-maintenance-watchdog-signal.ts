import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveDirectiveWorkspaceRoot } from "../src/server/paths/directive-workspace-root";

function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const directiveRoot = resolveDirectiveWorkspaceRoot();
  const contractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "openclaw-maintenance-watchdog-signal.md",
  );
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "openclaw-maintenance-watchdog-signal.schema.json",
  );
  const helperPath = path.join(root, "scripts", "submit-openclaw-maintenance-watchdog-signal.ps1");
  const queuePath = path.join(directiveRoot, "discovery", "intake-queue.json");

  const issues: string[] = [];
  if (!fs.existsSync(contractPath)) issues.push("missing maintenance watchdog signal contract");
  if (!fs.existsSync(schemaPath)) issues.push("missing maintenance watchdog signal schema");
  if (!fs.existsSync(helperPath)) issues.push("missing maintenance watchdog signal helper");

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-maint-watchdog-check-"));
  const maintenancePath = path.join(tempDir, "openclaw-maintenance-loop-state.json");
  const watchdogPath = path.join(tempDir, "telegram-watchdog-state.json");
  const historyPath = path.join(tempDir, "telegram-watchdog-history.jsonl");

  fs.writeFileSync(
    maintenancePath,
    JSON.stringify(
      {
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastWatchdogAt: "2026-01-01T00:00:00.000Z",
        lastGuardAt: "2026-01-01T00:00:00.000Z",
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    watchdogPath,
    JSON.stringify(
      {
        lastProbeAt: "2026-01-01T00:00:00.000Z",
        lastProbeOk: false,
        lastAction: "restart_failed",
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    historyPath,
    `${JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", action: "restart_failed", criticalFailures: 2, queuePendingOld: 1, probeOk: false })}\n`,
    "utf8",
  );

  let parsed: Record<string, unknown> | null = null;
  try {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperPath,
        "-MaintenanceStatePath",
        maintenancePath,
        "-WatchdogStatePath",
        watchdogPath,
        "-WatchdogHistoryPath",
        historyPath,
        "-CandidateId",
        "dryrun-openclaw-maintenance-watchdog-signal-check",
        "-DirectiveRoot",
        directiveRoot,
        "-QueuePath",
        queuePath,
        "-DryRun",
      ],
      { encoding: "utf8" },
    );
    parsed = JSON.parse(output.trim()) as Record<string, unknown>;
  } catch (error) {
    issues.push(`maintenance watchdog helper dry-run failed: ${String((error as Error).message || error)}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  if (!parsed || parsed.ok !== true) {
    issues.push("maintenance watchdog dry-run did not return ok=true");
  } else {
    if (parsed.signal_detected !== true) {
      issues.push("maintenance watchdog dry-run should detect degraded signal");
    }
    if (parsed.submitted !== false) {
      issues.push("maintenance watchdog dry-run should not submit");
    }
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
    if (reasons.length < 1) {
      issues.push("maintenance watchdog dry-run should include degraded reasons");
    }
    const submission = parsed.submission as Record<string, unknown> | undefined;
    const entry = submission?.entry as Record<string, unknown> | undefined;
    if (!entry) {
      issues.push("maintenance watchdog dry-run missing submission entry preview");
    } else {
      if (entry.status !== "pending") issues.push("maintenance watchdog entry preview status must be pending");
      if (entry.routing_target !== null) issues.push("maintenance watchdog entry preview routing_target must be null");
      if (entry.capability_gap_id !== null) {
        issues.push("maintenance watchdog entry preview capability_gap_id must remain null without an active unresolved gap");
      }
    }
  }

  const ok = issues.length === 0;
  console.log(
    JSON.stringify(
      {
        ok,
        metrics: {
          contractExists: true,
          schemaExists: true,
          helperExists: true,
          failedChecks: issues.length,
        },
        issues,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(1);
}

main();
