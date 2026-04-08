import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createQuest } from "../src/server/repositories/quests-repo.ts";
import { findOrCreateUser } from "../src/server/repositories/users-repo.ts";
import { getControlPlaneProjectId } from "../src/server/projects/workspace-projects.ts";
import { readNightlyOpsStepHotspotAlertsLatest } from "../src/server/services/nightly-ops-status-service.ts";
import {
  buildHotspotFailureIdentity,
  logHotspotFollowUpReport,
  resolveHotspotQuest,
  shouldSuppressHotspotByCooldown,
  type HotspotAlertSignal,
} from "../src/server/services/nightly-hotspot-guardrails-service.ts";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function severityRank(value: "high" | "medium" | "low") {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function parseMinSeverity(input: string | undefined): "high" | "medium" | "low" {
  const value = String(input || "").trim().toLowerCase();
  if (value === "medium" || value === "low") return value;
  return "high";
}

function main() {
  const now = new Date();
  const cooldownMinutes = Math.max(0, Math.floor(envNum("MISSION_CONTROL_HOTSPOT_COOLDOWN_MINUTES", 180)));
  const windowMinutes = Math.max(15, Math.floor(envNum("MISSION_CONTROL_HOTSPOT_WINDOW_MINUTES", 360)));
  const minSeverity = parseMinSeverity(process.env.MISSION_CONTROL_HOTSPOT_MIN_SEVERITY);
  const alertsSnapshot = readNightlyOpsStepHotspotAlertsLatest(process.cwd(), { maxAgeHours: 30 });

  const allAlerts = alertsSnapshot.alerts;
  const alerts = allAlerts.filter((item) => severityRank(item.severity) >= severityRank(minSeverity));
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

  if (alerts.length > 0) {
    const signals: HotspotAlertSignal[] = alerts.map((item) => ({
      stepId: item.stepId,
      severity: item.severity,
      reasons: item.reasons,
    }));
    const identity = buildHotspotFailureIdentity(signals, now, {
      cooldownMinutes,
      windowMinutes,
      minSeverity,
    });
    const cooldown = shouldSuppressHotspotByCooldown(user.id, projectId, identity.failureClass, cooldownMinutes, now);
    const existing = resolveHotspotQuest(user.id, projectId, identity.dedupeKey);

    let questId = existing.quest?.id ?? null;
    let action: "created" | "updated" | "suppressed" = existing.quest ? "updated" : "created";

    if (!existing.quest) {
      const quest = createQuest(
        user.id,
        projectId,
        `Investigate nightly hotspot regression [${identity.dedupeKey}]`,
        "normal",
        ["nightly-hotspots", "reliability", "ops"],
        "open",
        "runtime-reliability",
      );
      questId = quest.id;
    }

    const topAlerts = alerts.slice(0, 5).map((item) =>
      `- ${item.severity}:${item.stepId} fail=${Math.round(item.failureRate * 100)}% reasons=${item.reasons.join(",") || "none"}`,
    );

    if (!cooldown.onCooldown) {
      const content = [
        `Hotspot dedupe key: ${identity.dedupeKey}`,
        `Failure class: ${identity.failureClass}`,
        `Window key: ${identity.windowKey}`,
        `Min severity: ${minSeverity}`,
        "",
        "Top hotspot alerts:",
        ...topAlerts,
        "",
        "Next-step commands:",
        "- npm run check:nightly-step-hotspots",
        "- npm run check:nightly-hotspot-report-health",
        "- npm run check:nightly-hotspot-summary-health",
        "- npm run check:nightly-hotspot-alert-feed-health",
      ].join("\n");

      logHotspotFollowUpReport({
        userId: user.id,
        projectId,
        title: "Nightly hotspot follow-up",
        content,
        status: "warning",
        linkedQuestId: questId,
        metadata: {
          hotspot: {
            alertType: "failure",
            minSeverity,
            failureClass: identity.failureClass,
            dedupeKey: identity.dedupeKey,
            windowKey: identity.windowKey,
            cooldownMinutes,
            alerts: alerts.slice(0, 20),
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
    logHotspotFollowUpReport({
      userId: user.id,
      projectId,
      title: "Nightly hotspot follow-up passed",
      content: `No hotspot alerts at/above ${minSeverity} severity.`,
      status: "success",
      metadata: {
        hotspot: {
          alertType: "success",
          minSeverity,
        },
      },
    });
  }

  const payload = {
    generatedAt: now.toISOString(),
    ok: alerts.length === 0,
    minSeverity,
    sourceGeneratedAt: alertsSnapshot.generatedAt,
    sourceAlertCount: alertsSnapshot.alertCount,
    selectedAlertCount: alerts.length,
    bySeverity: {
      high: alerts.filter((item) => item.severity === "high").length,
      medium: alerts.filter((item) => item.severity === "medium").length,
      low: alerts.filter((item) => item.severity === "low").length,
    },
    topAlerts: alerts.slice(0, 10).map((item) => ({
      stepId: item.stepId,
      severity: item.severity,
      reasons: item.reasons,
      failureRate: item.failureRate,
      failingStreak: item.failingStreak,
      slowStreak: item.slowStreak,
      latestDurationMs: item.latestDurationMs,
      lastFailureAt: item.lastFailureAt,
    })),
    questAction,
  };

  const reportsDir = path.join(process.cwd(), "reports", "ops");
  mkdirSync(reportsDir, { recursive: true });
  const timestamped = path.join(reportsDir, `nightly-step-hotspots-followup-${toTimestampForFile(now)}.json`);
  const latest = path.join(reportsDir, "nightly-step-hotspots-followup-latest.json");
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(timestamped, serialized, "utf8");
  writeFileSync(latest, serialized, "utf8");

  process.stdout.write(
    `${JSON.stringify({
      ok: payload.ok,
      minSeverity,
      selectedAlertCount: payload.selectedAlertCount,
      questAction: payload.questAction,
      reports: { timestamped, latest },
    }, null, 2)}\n`,
  );
}

main();
