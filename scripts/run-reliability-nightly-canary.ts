import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createQuest } from "@/server/repositories/quests-repo";
import { findOrCreateUser } from "@/server/repositories/users-repo";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";
import {
  buildCanaryFailureIdentity,
  logCanaryFollowUpReport,
  resolveCanaryQuest,
  shouldSuppressByCooldown,
} from "@/server/services/nightly-canary-guardrails-service";

interface CanaryCheck {
  id:
    | "eval-guard"
    | "adapters"
    | "ui-smoke"
    | "reliability-thresholds"
    | "directive-proof-integrity"
    | "agency-agents";
  command: string;
  critical: boolean;
}

interface CanaryCheckResult {
  id: CanaryCheck["id"];
  command: string;
  critical: boolean;
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function compact(text: string, maxLen: number) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 3)}...`;
}

function runCheck(check: CanaryCheck): CanaryCheckResult {
  const proc = spawnSync("npm", ["run", "--silent", check.command], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
  });

  return {
    id: check.id,
    command: `npm run ${check.command}`,
    critical: check.critical,
    ok: (proc.status ?? 1) === 0,
    exitCode: proc.status ?? 1,
    stdout: String(proc.stdout || ""),
    stderr: String(proc.stderr || ""),
  };
}

function buildFailureSummary(results: CanaryCheckResult[]) {
  return results
    .filter((item) => !item.ok)
    .map((item) => {
      const body = compact(item.stderr || item.stdout, 260);
      return `- ${item.id} failed (${item.command})\n  ${body || "no output"}`;
    })
    .join("\n");
}

function writeReports(payload: Record<string, unknown>, now: Date) {
  const reportsDir = path.join(process.cwd(), "reports", "ops");
  mkdirSync(reportsDir, { recursive: true });

  const stamp = toTimestampForFile(now);
  const timestamped = path.join(reportsDir, `canary-${stamp}.json`);
  const latest = path.join(reportsDir, "canary-latest.json");
  const serialized = JSON.stringify(payload, null, 2);

  writeFileSync(timestamped, serialized, "utf8");
  writeFileSync(latest, serialized, "utf8");

  return { timestamped, latest };
}

async function main() {
  const now = new Date();
  const cooldownMinutes = Math.max(0, Math.floor(envNum("MISSION_CONTROL_CANARY_COOLDOWN_MINUTES", 180)));
  const windowMinutes = Math.max(15, Math.floor(envNum("MISSION_CONTROL_CANARY_WINDOW_MINUTES", 360)));

  const checks: CanaryCheck[] = [
    { id: "eval-guard", command: "check:agent-evals", critical: true },
    { id: "directive-proof-integrity", command: "check:directive-integration-proof", critical: true },
    { id: "agency-agents", command: "check:agency-agents", critical: true },
    { id: "adapters", command: "check:adapters", critical: true },
    { id: "ui-smoke", command: "check:ui-smoke", critical: true },
    { id: "reliability-thresholds", command: "check:reliability", critical: true },
  ];

  const results = checks.map(runCheck);
  const failedCritical = results.filter((item) => !item.ok && item.critical);
  const overallOk = failedCritical.length === 0;

  const user = findOrCreateUser();
  const projectId = getControlPlaneProjectId();

  let questAction: {
    action: "none" | "created" | "updated" | "suppressed";
    questId: string | null;
    dedupeKey: string | null;
    failureClass: string | null;
    cooldown: { onCooldown: boolean; minutesRemaining: number; lastAlertAt: string | null };
  } = {
    action: "none",
    questId: null,
    dedupeKey: null,
    failureClass: null,
    cooldown: { onCooldown: false, minutesRemaining: 0, lastAlertAt: null },
  };

  if (!overallOk) {
    const identity = buildCanaryFailureIdentity(
      failedCritical.map((item) => item.id),
      now,
      { cooldownMinutes, windowMinutes },
    );

    const cooldown = shouldSuppressByCooldown(user.id, projectId, identity.failureClass, cooldownMinutes, now);
    const existing = resolveCanaryQuest(user.id, projectId, identity.dedupeKey);

    let questId = existing.quest?.id ?? null;
    let action: "created" | "updated" | "suppressed" = existing.quest ? "updated" : "created";

    if (!existing.quest) {
      const goal = `Nightly canary follow-up [${identity.dedupeKey}]`;
      const quest = createQuest(
        user.id,
        projectId,
        goal,
        "normal",
        ["reliability", "nightly-canary", "ops"],
        "open",
        "runtime-reliability",
      );
      questId = quest.id;
    }

    const nextSteps = [
      "npm run check:agent-evals",
      "npm run check:directive-integration-proof",
      "npm run check:agency-agents",
      "npm run check:adapters",
      "npm run check:ui-smoke",
      "npm run check:reliability",
    ];

    if (!cooldown.onCooldown) {
      const content = [
        `Canary dedupe key: ${identity.dedupeKey}`,
        `Failure class: ${identity.failureClass}`,
        "",
        "Failure summary:",
        buildFailureSummary(failedCritical),
        "",
        "Next-step commands:",
        ...nextSteps.map((cmd) => `- ${cmd}`),
      ].join("\n");

      logCanaryFollowUpReport({
        userId: user.id,
        projectId,
        title: "Nightly canary failure follow-up",
        content,
        status: "warning",
        linkedQuestId: questId,
        metadata: {
          canary: {
            alertType: "failure",
            failureClass: identity.failureClass,
            dedupeKey: identity.dedupeKey,
            windowKey: identity.windowKey,
            cooldownMinutes,
            failingCommands: failedCritical.map((item) => item.command),
          },
        },
      });
    } else {
      action = "suppressed";
    }

    questAction = {
      action,
      questId,
      dedupeKey: identity.dedupeKey,
      failureClass: identity.failureClass,
      cooldown,
    };
  } else {
    logCanaryFollowUpReport({
      userId: user.id,
      projectId,
      title: "Nightly canary passed",
      content: `Nightly canary passed (${results.length}/${results.length} checks).`,
      status: "success",
      metadata: {
        canary: {
          alertType: "success",
          checks: results.map((item) => item.id),
        },
      },
    });
  }

  const payload = {
    generatedAt: now.toISOString(),
    ok: overallOk,
    checks: results.map((item) => ({
      id: item.id,
      command: item.command,
      critical: item.critical,
      ok: item.ok,
      exitCode: item.exitCode,
      stdout: compact(item.stdout, 4000),
      stderr: compact(item.stderr, 2000),
    })),
    failedCriticalCount: failedCritical.length,
    guardrails: {
      cooldownMinutes,
      windowMinutes,
    },
    questAction,
  };

  const reportPaths = writeReports(payload, now);
  process.stdout.write(`${JSON.stringify({ ...payload, reports: reportPaths }, null, 2)}\n`);

  if (!overallOk) {
    process.exit(1);
  }
}

void main();
