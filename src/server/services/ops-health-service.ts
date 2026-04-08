import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getControlPlaneProjectId, getWorkspaceRootPath } from "@/server/projects/workspace-projects";
import { readNightlyOpsSnapshot } from "./nightly-ops-status-service.ts";
import { readRepoSourcesLatestReport } from "./repo-sources-report-service.ts";

export interface OpsHealthItem {
  key: "repoSources" | "canary" | "workspaceHealth" | "nightlyBundle";
  label: string;
  reportFile: string;
  available: boolean;
  ok: boolean | null;
  stale: boolean;
  generatedAt: string | null;
  ageMinutes: number | null;
  detail: string;
}

export interface OpsHealthSnapshot {
  generatedAt: string;
  maxAgeHours: number;
  overallOk: boolean | null;
  items: {
    repoSources: OpsHealthItem;
    canary: OpsHealthItem;
    workspaceHealth: OpsHealthItem;
    nightlyBundle: OpsHealthItem;
  };
}

function getControlPlaneProjectRootPath() {
  return path.join(getWorkspaceRootPath(), getControlPlaneProjectId());
}

function toAgeMinutes(generatedAt: string | null) {
  const ms = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 60_000));
}

function readJson(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readCanaryStatus(projectRootPath: string, maxAgeHours: number): OpsHealthItem {
  const reportFile = "canary-latest.json";
  const reportPath = path.join(projectRootPath, "reports", "ops", reportFile);
  const payload = readJson(reportPath);
  if (!payload) {
    return {
      key: "canary",
      label: "Canary",
      reportFile,
      available: false,
      ok: null,
      stale: true,
      generatedAt: null,
      ageMinutes: null,
      detail: "not generated",
    };
  }

  const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : null;
  const ageMinutes = toAgeMinutes(generatedAt);
  const stale = ageMinutes === null ? true : ageMinutes > maxAgeHours * 60;
  const failedCritical = Number(payload.failedCriticalCount ?? 0);
  const ok = typeof payload.ok === "boolean" ? payload.ok && !stale && failedCritical === 0 : null;

  return {
    key: "canary",
    label: "Canary",
    reportFile,
    available: true,
    ok,
    stale,
    generatedAt,
    ageMinutes,
    detail: `failedCritical=${failedCritical}`,
  };
}

function readWorkspaceHealthStatus(projectRootPath: string, maxAgeHours: number): OpsHealthItem {
  const reportFile = "workspace-global-health-latest.json";
  const reportPath = path.join(projectRootPath, "reports", "ops", reportFile);
  const payload = readJson(reportPath);
  if (!payload) {
    return {
      key: "workspaceHealth",
      label: "Workspace Health",
      reportFile,
      available: false,
      ok: null,
      stale: true,
      generatedAt: null,
      ageMinutes: null,
      detail: "not generated",
    };
  }

  const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : null;
  const ageMinutes = toAgeMinutes(generatedAt);
  const stale = ageMinutes === null ? true : ageMinutes > maxAgeHours * 60;
  const summary = payload.summary as Record<string, unknown> | undefined;
  const runtime = summary?.runtimeChecks as Record<string, unknown> | undefined;
  const projects = summary?.projects as Record<string, unknown> | undefined;
  const runtimePassed = Number(runtime?.passed ?? 0);
  const runtimeTotal = Number(runtime?.total ?? 0);
  const projectHealthy = Number(projects?.healthy ?? 0);
  const projectTotal = Number(projects?.total ?? 0);
  const baseOk = typeof payload.ok === "boolean" ? payload.ok : false;
  const ok = !stale && baseOk && runtimeTotal > 0 && runtimePassed === runtimeTotal && projectTotal > 0 && projectHealthy === projectTotal;

  return {
    key: "workspaceHealth",
    label: "Workspace Health",
    reportFile,
    available: true,
    ok,
    stale,
    generatedAt,
    ageMinutes,
    detail: `projects=${projectHealthy}/${projectTotal}, runtime=${runtimePassed}/${runtimeTotal}`,
  };
}

export function readOpsHealthSnapshot(projectRootPath: string, options?: { maxAgeHours?: number }): OpsHealthSnapshot {
  const maxAgeHours = Number.isFinite(options?.maxAgeHours) ? Number(options?.maxAgeHours) : 30;
  const controlPlaneRootPath = getControlPlaneProjectRootPath();

  const repoSourcesSnapshot = readRepoSourcesLatestReport({ maxAgeHours: Math.min(24, maxAgeHours) });
  const repoSources: OpsHealthItem = {
    key: "repoSources",
    label: "Repo Sources",
    reportFile: "repo-sync-latest.json",
    available: repoSourcesSnapshot.available,
    ok: repoSourcesSnapshot.available ? !repoSourcesSnapshot.stale && repoSourcesSnapshot.summary.blocked === 0 : null,
    stale: repoSourcesSnapshot.stale,
    generatedAt: repoSourcesSnapshot.generatedAt,
    ageMinutes: repoSourcesSnapshot.ageMinutes,
    detail: `blocked=${repoSourcesSnapshot.summary.blocked}, updates=${repoSourcesSnapshot.summary.updateAvailable}`,
  };

  const canary = readCanaryStatus(controlPlaneRootPath, maxAgeHours);
  const workspaceHealth = readWorkspaceHealthStatus(controlPlaneRootPath, maxAgeHours);
  const nightly = readNightlyOpsSnapshot({ maxAgeHours });
  const nightlyBundle: OpsHealthItem = {
    key: "nightlyBundle",
    label: "Nightly Bundle",
    reportFile: nightly.items.bundle.reportFile,
    available: nightly.items.bundle.available,
    ok: nightly.items.bundle.available ? !nightly.items.bundle.stale && nightly.items.bundle.ok === true : null,
    stale: nightly.items.bundle.stale,
    generatedAt: nightly.items.bundle.generatedAt,
    ageMinutes: nightly.items.bundle.ageMinutes,
    detail: nightly.items.bundle.detail,
  };

  const itemsArray = [repoSources, canary, workspaceHealth, nightlyBundle];
  const overallOk = itemsArray.some((item) => item.available)
    ? itemsArray.every((item) => item.available && item.ok === true && !item.stale)
    : null;

  return {
    generatedAt: new Date().toISOString(),
    maxAgeHours,
    overallOk,
    items: {
      repoSources,
      canary,
      workspaceHealth,
      nightlyBundle,
    },
  };
}
