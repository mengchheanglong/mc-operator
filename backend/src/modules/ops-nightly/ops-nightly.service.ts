import { Injectable } from "@nestjs/common";
import fs from "node:fs";
import path from "node:path";
import { ProjectPathsService } from "../../infra/project-paths.service";

function readJson(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseStringFromLine(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^-\\s*${escaped}:\\s*(.+?)\\s*$`, "mi");
  const match = content.match(regex);
  return match ? String(match[1]).trim() : null;
}

function parseNumberFromLine(content: string, label: string): number | null {
  const value = parseStringFromLine(content, label);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type NightlyReportSnapshot = {
  reportFile: string;
  available: boolean;
  payload: Record<string, unknown> | null;
  generatedAt: string | null;
  stale: boolean;
  ageMinutes: number | null;
  ok: boolean | null;
};

@Injectable()
export class OpsNightlyService {
  constructor(private readonly projectPaths: ProjectPathsService) {}

  private reportsRoot(projectId?: unknown) {
    const projectRoot = this.projectPaths.resolveProjectRoot(projectId);
    return path.join(projectRoot, "reports", "ops");
  }

  private readLatestJson(
    projectId: unknown,
    reportFile: string,
    maxAgeHours = 30,
  ): NightlyReportSnapshot {
    const reportPath = path.join(this.reportsRoot(projectId), reportFile);
    const payload = readJson(reportPath);
    if (!payload) {
      return {
        reportFile,
        available: false,
        payload: null,
        generatedAt: null,
        stale: true,
        ageMinutes: null,
        ok: null,
      };
    }

    const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : null;
    const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
    const ageMinutes = Number.isFinite(generatedAtMs)
      ? Math.max(0, Math.floor((Date.now() - generatedAtMs) / 60_000))
      : null;
    const stale = ageMinutes === null ? true : ageMinutes > maxAgeHours * 60;
    const ok = typeof payload.ok === "boolean" ? payload.ok : null;
    return {
      reportFile,
      available: true,
      payload,
      generatedAt,
      stale,
      ageMinutes,
      ok,
    };
  }

  private severityRank(value: string | null) {
    if (value === "high") return 3;
    if (value === "medium") return 2;
    return 1;
  }

  private parseSummaryMarkdown(
    projectId: unknown,
    reportFile: string,
    fallbackOverall: "PASS" | "FAIL" | "UNKNOWN" = "UNKNOWN",
  ) {
    const reportPath = path.join(this.reportsRoot(projectId), reportFile);
    if (!fs.existsSync(reportPath)) {
      return {
        reportFile,
        available: false,
        generatedAt: null,
        overall: "UNKNOWN" as const,
      };
    }
    const content = fs.readFileSync(reportPath, "utf8");
    const overallRaw = parseStringFromLine(content, "Overall");
    const overall =
      overallRaw === "PASS" || overallRaw === "FAIL" ? overallRaw : fallbackOverall;
    return {
      reportFile,
      available: true,
      generatedAt: parseStringFromLine(content, "Generated At"),
      overall,
      failedCount: parseNumberFromLine(content, "Failed Count"),
      durationMs: parseNumberFromLine(content, "Duration (ms)"),
      stepOrderVersion: parseNumberFromLine(content, "Step Order Version"),
    };
  }

  private readTrendFiles(projectId: unknown, prefix: RegExp, limit: number) {
    const root = this.reportsRoot(projectId);
    if (!fs.existsSync(root)) return [] as Record<string, unknown>[];
    const files = fs
      .readdirSync(root)
      .filter((file) => prefix.test(file))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit);
    const records: Record<string, unknown>[] = [];
    for (const file of files) {
      const payload = readJson(path.join(root, file));
      if (payload) {
        records.push({
          reportFile: file,
          generatedAt:
            typeof payload.generatedAt === "string" ? payload.generatedAt : null,
          ok: typeof payload.ok === "boolean" ? payload.ok : null,
          payload,
        });
      }
    }
    return records;
  }

  private readSnapshot(projectId?: unknown) {
    const bundle = this.readLatestJson(projectId, "nightly-ops-bundle-latest.json");
    const opsHealth = this.readLatestJson(projectId, "ops-health-latest.json");
    const repoSources = this.readLatestJson(projectId, "repo-sync-latest.json");
    const workspaceHealth = this.readLatestJson(
      projectId,
      "workspace-global-health-latest.json",
    );
    const canary = this.readLatestJson(projectId, "canary-latest.json");
    const orchestrator = this.readLatestJson(projectId, "orchestrator-nightly-latest.json");

    const items = {
      bundle: {
        key: "bundle",
        label: "Nightly Bundle",
        reportFile: bundle.reportFile,
        available: bundle.available,
        ok: bundle.ok,
        stale: bundle.stale,
        ageMinutes: bundle.ageMinutes,
        generatedAt: bundle.generatedAt,
        detail: bundle.available
          ? `failedCount=${Number(bundle.payload?.failedCount ?? 0)}`
          : "not generated",
      },
      opsHealthSnapshot: {
        key: "opsHealthSnapshot",
        label: "Ops Health Snapshot",
        reportFile: opsHealth.reportFile,
        available: opsHealth.available,
        ok: opsHealth.ok,
        stale: opsHealth.stale,
        ageMinutes: opsHealth.ageMinutes,
        generatedAt: opsHealth.generatedAt,
        detail: opsHealth.available ? "snapshot available" : "not generated",
      },
      repoSources: {
        key: "repoSources",
        label: "Repo Sources",
        reportFile: repoSources.reportFile,
        available: repoSources.available,
        ok: repoSources.ok,
        stale: repoSources.stale,
        ageMinutes: repoSources.ageMinutes,
        generatedAt: repoSources.generatedAt,
        detail: repoSources.available ? "sync report available" : "not generated",
      },
      workspaceHealth: {
        key: "workspaceHealth",
        label: "Workspace Health",
        reportFile: workspaceHealth.reportFile,
        available: workspaceHealth.available,
        ok: workspaceHealth.ok,
        stale: workspaceHealth.stale,
        ageMinutes: workspaceHealth.ageMinutes,
        generatedAt: workspaceHealth.generatedAt,
        detail: workspaceHealth.available ? "health report available" : "not generated",
      },
      canary: {
        key: "canary",
        label: "Canary",
        reportFile: canary.reportFile,
        available: canary.available,
        ok: canary.ok,
        stale: canary.stale,
        ageMinutes: canary.ageMinutes,
        generatedAt: canary.generatedAt,
        detail: canary.available ? "canary report available" : "not generated",
      },
      orchestrator: {
        key: "orchestrator",
        label: "Orchestrator",
        reportFile: orchestrator.reportFile,
        available: orchestrator.available,
        ok: orchestrator.ok,
        stale: orchestrator.stale,
        ageMinutes: orchestrator.ageMinutes,
        generatedAt: orchestrator.generatedAt,
        detail: orchestrator.available ? "orchestrator report available" : "not generated",
      },
    };

    const values = Object.values(items);
    const overallOk = values.some((item) => item.available)
      ? values.every((item) => item.available && item.ok === true && item.stale === false)
      : null;

    return {
      generatedAt: new Date().toISOString(),
      maxAgeHours: 30,
      overallOk,
      items,
    };
  }

  read(input: {
    projectId?: string;
    view?: string;
    step?: string;
    flaggedOnly?: string;
    minSeverity?: string;
    limit?: string;
  }) {
    const projectId = input.projectId || "mc-operator";
    const view = String(input.view || "").trim();
    const stepFilter = String(input.step || "").trim();
    const flaggedOnly = String(input.flaggedOnly || "").trim().toLowerCase() === "true";
    const minSeverity = String(input.minSeverity || "").trim().toLowerCase() || null;
    const requestedLimit = Number(input.limit ?? "8");
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(30, Math.floor(requestedLimit)))
      : 8;

    const snapshot = this.readSnapshot(projectId);

    if (view === "failing") {
      const failing = Object.values(snapshot.items).filter(
        (item) => !(item.available && item.ok === true && item.stale === false),
      );
      return {
        ok: failing.length === 0,
        generatedAt: snapshot.generatedAt,
        overallOk: snapshot.overallOk,
        maxAgeHours: snapshot.maxAgeHours,
        failingCount: failing.length,
        failing,
      };
    }

    if (view === "timeline") {
      const bundle = this.readLatestJson(projectId, "nightly-ops-bundle-latest.json");
      return {
        ok: bundle.available && bundle.ok === true,
        bundle: {
          ...bundle,
          payload: bundle.payload,
        },
      };
    }

    if (view === "trend") {
      const trend = this.readTrendFiles(
        projectId,
        /^nightly-ops-bundle-\d{4}-\d{2}-\d{2}T.*\.json$/i,
        limit,
      ).map((entry) => {
        const payload = (entry.payload || {}) as Record<string, unknown>;
        return {
          reportFile: entry.reportFile,
          generatedAt: entry.generatedAt,
          ok: entry.ok,
          failedCount: Number(payload.failedCount ?? 0),
          durationMs: Number(payload.durationMs ?? 0),
          stepOrderVersion: Number(payload.stepOrderVersion ?? 0),
        };
      });
      return {
        ok: trend.every((point) => point.ok !== false),
        limit,
        count: trend.length,
        trend,
      };
    }

    if (view === "summary") {
      const summary = this.parseSummaryMarkdown(projectId, "nightly-ops-summary-latest.md");
      return {
        ok: summary.available && summary.overall === "PASS",
        summary,
      };
    }

    if (view === "hotspots" || view === "hotspot-report") {
      const hotspotReport = this.readLatestJson(projectId, "nightly-step-hotspots-latest.json");
      const payload = (hotspotReport.payload || {}) as Record<string, unknown>;
      const allHotspots = Array.isArray(payload.hotspots)
        ? (payload.hotspots as Array<Record<string, unknown>>)
        : [];
      const hotspots = allHotspots.filter((item) => {
        const stepId = String(item.stepId || "").trim();
        if (stepFilter && stepId !== stepFilter) return false;
        const isFlagged = Boolean(item.flagged);
        if (flaggedOnly && !isFlagged) return false;
        const severity = String(item.severity || "low").trim().toLowerCase();
        if (
          minSeverity &&
          this.severityRank(severity || null) < this.severityRank(minSeverity)
        ) {
          return false;
        }
        return true;
      });

      const flaggedCount = hotspots.filter((item) => Boolean(item.flagged)).length;
      const health = {
        ok: flaggedCount === 0,
        status: flaggedCount === 0 ? "healthy" : "warning",
        reasons: flaggedCount === 0 ? [] : ["flagged_steps_exceeded"],
        totalSteps: hotspots.length,
        flaggedCount,
        thresholds: {
          maxFlaggedSteps: 0,
        },
      };

      if (view === "hotspot-report") {
        return {
          ok: hotspotReport.available && hotspotReport.stale === false,
          step: stepFilter || null,
          flaggedOnly,
          minSeverity,
          report: {
            ...hotspotReport,
            hotspots,
            filteredCount: hotspots.length,
            totalCount: allHotspots.length,
          },
        };
      }

      return {
        ok: health.ok,
        limit,
        step: stepFilter || null,
        flaggedOnly,
        minSeverity,
        count: hotspots.length,
        totalCount: allHotspots.length,
        health,
        hotspots,
      };
    }

    if (view === "hotspot-trend") {
      const trend = this.readTrendFiles(
        projectId,
        /^nightly-step-hotspots-\d{4}-\d{2}-\d{2}T.*\.json$/i,
        limit,
      ).map((entry) => {
        const payload = (entry.payload || {}) as Record<string, unknown>;
        const health = (payload.health || {}) as Record<string, unknown>;
        return {
          reportFile: entry.reportFile,
          generatedAt: entry.generatedAt,
          ok: entry.ok,
          flaggedCount: Number(health.flaggedCount ?? 0),
          totalSteps: Number(health.totalSteps ?? 0),
        };
      });
      return {
        ok: trend.every((point) => point.ok !== false),
        limit,
        count: trend.length,
        trend,
      };
    }

    if (view === "hotspot-alerts") {
      const alerts = this.readLatestJson(projectId, "nightly-step-hotspots-alerts-latest.json");
      return {
        ok: alerts.available && alerts.stale === false,
        alerts,
      };
    }

    if (view === "hotspot-followup") {
      const followup = this.readLatestJson(
        projectId,
        "nightly-step-hotspots-followup-latest.json",
      );
      return {
        ok: followup.available && followup.stale === false,
        followup,
      };
    }

    if (view === "hotspot-summary") {
      const summary = this.parseSummaryMarkdown(
        projectId,
        "nightly-step-hotspots-summary-latest.md",
      );
      return {
        ok: summary.available && summary.overall === "PASS",
        summary,
      };
    }

    return {
      ok: snapshot.overallOk === true,
      ...snapshot,
    };
  }
}
