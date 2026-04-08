import { Injectable } from "@nestjs/common";
import fs from "node:fs";
import path from "node:path";

type OpsHealthKey = "repoSources" | "canary" | "workspaceHealth" | "nightlyBundle";

type OpsHealthItem = {
  key: OpsHealthKey;
  label: string;
  reportFile: string;
  available: boolean;
  ok: boolean | null;
  stale: boolean;
  generatedAt: string | null;
  ageMinutes: number | null;
  detail: string;
};

function normalizeBasePath(value?: string | null) {
  const input = String(value || "").trim();
  if (!input) return null;
  return path.resolve(input);
}

function readJson(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toAgeMinutes(generatedAt: string | null) {
  const ms = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 60_000));
}

function toStatusItem(input: {
  key: OpsHealthKey;
  label: string;
  reportFile: string;
  payload: Record<string, unknown> | null;
  maxAgeHours: number;
  okEvaluator: (payload: Record<string, unknown>) => { ok: boolean | null; detail: string };
}): OpsHealthItem {
  const { key, label, reportFile, payload, maxAgeHours, okEvaluator } = input;
  if (!payload) {
    return {
      key,
      label,
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
  const evaluation = okEvaluator(payload);

  return {
    key,
    label,
    reportFile,
    available: true,
    ok: stale ? false : evaluation.ok,
    stale,
    generatedAt,
    ageMinutes,
    detail: evaluation.detail,
  };
}

@Injectable()
export class OpsHealthService {
  private workspaceRoot() {
    return (
      normalizeBasePath(process.env.OPENCLAW_WORKSPACE_ROOT) ||
      path.resolve(process.cwd(), "..", "..")
    );
  }

  private projectRoot(projectId: string) {
    const workspaceRoot = this.workspaceRoot();
    const normalizedId = String(projectId || "").trim() || "mission-control";
    const candidate = path.resolve(workspaceRoot, normalizedId);
    if (fs.existsSync(candidate)) return candidate;
    return path.resolve(process.cwd(), "..");
  }

  readSnapshot(projectId: string, maxAgeHours = 30) {
    const rootPath = this.projectRoot(projectId);
    const reportsRoot = path.join(rootPath, "reports", "ops");

    const repoSourcesPayload = readJson(path.join(reportsRoot, "repo-sync-latest.json"));
    const canaryPayload = readJson(path.join(reportsRoot, "canary-latest.json"));
    const workspaceHealthPayload = readJson(
      path.join(reportsRoot, "workspace-global-health-latest.json"),
    );
    const nightlyPayload = readJson(path.join(reportsRoot, "nightly-ops-bundle-latest.json"));

    const repoSources = toStatusItem({
      key: "repoSources",
      label: "Repo Sources",
      reportFile: "repo-sync-latest.json",
      payload: repoSourcesPayload,
      maxAgeHours,
      okEvaluator: (payload) => {
        const summary = (payload.summary || {}) as Record<string, unknown>;
        const blocked = Number(summary.blocked ?? 0);
        return { ok: blocked === 0, detail: `blocked=${blocked}` };
      },
    });

    const canary = toStatusItem({
      key: "canary",
      label: "Canary",
      reportFile: "canary-latest.json",
      payload: canaryPayload,
      maxAgeHours,
      okEvaluator: (payload) => {
        const failedCritical = Number(payload.failedCriticalCount ?? 0);
        const ok = Boolean(payload.ok) && failedCritical === 0;
        return { ok, detail: `failedCritical=${failedCritical}` };
      },
    });

    const workspaceHealth = toStatusItem({
      key: "workspaceHealth",
      label: "Workspace Health",
      reportFile: "workspace-global-health-latest.json",
      payload: workspaceHealthPayload,
      maxAgeHours,
      okEvaluator: (payload) => {
        const summary = (payload.summary || {}) as Record<string, unknown>;
        const projects = (summary.projects || {}) as Record<string, unknown>;
        const runtime = (summary.runtimeChecks || {}) as Record<string, unknown>;
        const healthy = Number(projects.healthy ?? 0);
        const total = Number(projects.total ?? 0);
        const passed = Number(runtime.passed ?? 0);
        const runtimeTotal = Number(runtime.total ?? 0);
        const ok =
          Boolean(payload.ok) &&
          total > 0 &&
          runtimeTotal > 0 &&
          healthy === total &&
          passed === runtimeTotal;
        return {
          ok,
          detail: `projects=${healthy}/${total}, runtime=${passed}/${runtimeTotal}`,
        };
      },
    });

    const nightlyBundle = toStatusItem({
      key: "nightlyBundle",
      label: "Nightly Bundle",
      reportFile: "nightly-ops-bundle-latest.json",
      payload: nightlyPayload,
      maxAgeHours,
      okEvaluator: (payload) => {
        const failedCount = Number(payload.failedCount ?? 0);
        const ok = Boolean(payload.ok) && failedCount === 0;
        return { ok, detail: `failedCount=${failedCount}` };
      },
    });

    const itemList = [repoSources, canary, workspaceHealth, nightlyBundle];
    const overallOk = itemList.some((item) => item.available)
      ? itemList.every((item) => item.available && item.ok === true && item.stale === false)
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
}
