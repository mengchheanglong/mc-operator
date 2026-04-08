import fs from "node:fs";
import path from "node:path";
import { getControlPlaneProjectId, getWorkspaceRootPath } from "@/server/projects/workspace-projects";

const BLOCKING_REPO_SOURCE_STATES = new Set([
  "pull_failed",
  "fetch_failed",
  "missing_path",
  "not_git",
]);

type RepoSourcesLatestPayload = {
  generatedAt?: string;
  summary?: {
    total?: number;
    enabled?: number;
    updateAvailable?: number;
    updated?: number;
    upToDate?: number;
    dirtyAllowed?: number;
    dirtyBlocking?: number;
    blocked?: number;
    skipped?: number;
  };
  countsByState?: Record<string, unknown>;
  repositories?: unknown[];
};

export interface RepoSourcesBlockedEntry {
  name: string;
  path: string;
  state: string;
  error: string | null;
  command: string | null;
  remoteUrl: string | null;
  currentBranch: string | null;
  dirty: boolean | null;
  ahead: number | null;
  behind: number | null;
}

export interface RepoSourcesLatestSnapshot {
  available: boolean;
  generatedAt: string | null;
  stale: boolean;
  maxAgeHours: number;
  ageMinutes: number | null;
  summary: {
    total: number;
    enabled: number;
    updateAvailable: number;
    updated: number;
    upToDate: number;
    dirtyAllowed: number;
    dirtyBlocking: number;
    blocked: number;
    skipped: number;
  };
  countsByState: Record<string, number>;
  blockedEntries: RepoSourcesBlockedEntry[];
}

function getControlPlaneProjectRootPath() {
  return path.join(getWorkspaceRootPath(), getControlPlaneProjectId());
}

export function getRepoSourcesReportsDir(projectRoot?: string) {
  return path.join(projectRoot || getControlPlaneProjectRootPath(), "reports", "ops");
}

function asNonNegativeInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
}

function asOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function emptyRepoSourcesSnapshot(): RepoSourcesLatestSnapshot {
  return {
    available: false,
    generatedAt: null,
    stale: true,
    maxAgeHours: 24,
    ageMinutes: null,
    summary: {
      total: 0,
      enabled: 0,
      updateAvailable: 0,
      updated: 0,
      upToDate: 0,
      dirtyAllowed: 0,
      dirtyBlocking: 0,
      blocked: 0,
      skipped: 0,
    },
    countsByState: {},
    blockedEntries: [],
  };
}

function readSummary(summary: RepoSourcesLatestPayload["summary"], repositoryCount: number) {
  return {
    total: asNonNegativeInt(summary?.total, repositoryCount),
    enabled: asNonNegativeInt(summary?.enabled, 0),
    updateAvailable: asNonNegativeInt(summary?.updateAvailable, 0),
    updated: asNonNegativeInt(summary?.updated, 0),
    upToDate: asNonNegativeInt(summary?.upToDate, 0),
    dirtyAllowed: asNonNegativeInt(summary?.dirtyAllowed, 0),
    dirtyBlocking: asNonNegativeInt(summary?.dirtyBlocking, 0),
    blocked: asNonNegativeInt(summary?.blocked, 0),
    skipped: asNonNegativeInt(summary?.skipped, 0),
  };
}

function parseBlockedEntries(repositories: unknown[]): RepoSourcesBlockedEntry[] {
  return repositories
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const row = entry as Record<string, unknown>;
      const state = asOptionalString(row.state);
      if (!state || !BLOCKING_REPO_SOURCE_STATES.has(state)) {
        return null;
      }

      return {
        name: asOptionalString(row.name) || "(unknown)",
        path: asOptionalString(row.path) || "(unknown)",
        state,
        error: asOptionalString(row.error),
        command: asOptionalString(row.command),
        remoteUrl: asOptionalString(row.remoteUrl),
        currentBranch: asOptionalString(row.currentBranch),
        dirty: typeof row.dirty === "boolean" ? row.dirty : null,
        ahead:
          row.ahead === null || row.ahead === undefined
            ? null
            : asNonNegativeInt(row.ahead, 0),
        behind:
          row.behind === null || row.behind === undefined
            ? null
            : asNonNegativeInt(row.behind, 0),
      } satisfies RepoSourcesBlockedEntry;
    })
    .filter((entry): entry is RepoSourcesBlockedEntry => entry !== null)
    .sort((left, right) => {
      const stateComparison = left.state.localeCompare(right.state);
      if (stateComparison !== 0) return stateComparison;
      return left.path.localeCompare(right.path);
    });
}

type RepoSourcesLatestReportOptions = {
  maxAgeHours?: number;
};

function parseReadArgs(
  arg1?: string | RepoSourcesLatestReportOptions,
  arg2?: RepoSourcesLatestReportOptions,
) {
  if (typeof arg1 === "string") {
    return {
      projectRoot: arg1,
      options: arg2 || {},
    };
  }

  return {
    projectRoot: undefined,
    options: arg1 || {},
  };
}

export function readRepoSourcesLatestReport(
  arg1?: string | RepoSourcesLatestReportOptions,
  arg2?: RepoSourcesLatestReportOptions,
): RepoSourcesLatestSnapshot {
  const { projectRoot, options } = parseReadArgs(arg1, arg2);
  const maxAgeHours = Number.isFinite(options?.maxAgeHours) ? Number(options?.maxAgeHours) : 24;
  const latestPath = path.join(getRepoSourcesReportsDir(projectRoot), "repo-sync-latest.json");
  if (!fs.existsSync(latestPath)) {
    return {
      ...emptyRepoSourcesSnapshot(),
      maxAgeHours,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(latestPath, "utf8")) as RepoSourcesLatestPayload;
    const rawCountsByState = parsed.countsByState || {};
    const countsByState = Object.fromEntries(
      Object.entries(rawCountsByState)
        .filter(([key]) => key.trim().length > 0)
        .map(([key, value]) => [key, asNonNegativeInt(value, 0)]),
    );

    const repositories = Array.isArray(parsed.repositories) ? parsed.repositories : [];
    const blockedEntries = parseBlockedEntries(repositories);
    const summary = readSummary(parsed.summary, repositories.length);
    const generatedAt = asOptionalString(parsed.generatedAt);
    const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
    const ageMinutes = Number.isFinite(generatedAtMs)
      ? Math.max(0, Math.floor((Date.now() - generatedAtMs) / 60_000))
      : null;
    const stale = ageMinutes === null ? true : ageMinutes > maxAgeHours * 60;

    return {
      available: true,
      generatedAt,
      stale,
      maxAgeHours,
      ageMinutes,
      summary,
      countsByState,
      blockedEntries,
    };
  } catch {
    return {
      ...emptyRepoSourcesSnapshot(),
      maxAgeHours,
    };
  }
}
