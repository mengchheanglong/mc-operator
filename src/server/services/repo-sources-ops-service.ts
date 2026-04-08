import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getControlPlaneProjectId, getWorkspaceRootPath } from "@/server/projects/workspace-projects";
import { runRepoSourcesSync, type RepoSourceEntry } from "../../../scripts/repo-sources-lib.ts";
import {
  getRepoSourcesReportsDir,
  readRepoSourcesLatestReport,
  type RepoSourcesLatestSnapshot,
} from "./repo-sources-report-service.ts";
import {
  getRepoSourcesConfigPath,
  readRepoSourcesConfig,
  updateRepoSourcesConfigEntry,
  type RepoSourcesConfigEntry,
} from "./repo-sources-config-service.ts";

const REPO_SOURCES_LOCK_NAME = "repo-sources-op.lock";
const inFlightLocks = new Set<string>();

function getControlPlaneProjectRootPath() {
  return path.join(getWorkspaceRootPath(), getControlPlaneProjectId());
}

export type RepoSourcesRefreshMode = "check" | "update";
export type RepoSourcesOperationScope = "all" | "single";

export interface RepoSourcesRefreshInput {
  mode: RepoSourcesRefreshMode;
  scope?: RepoSourcesOperationScope;
  targetPath?: string;
  maxAgeHours?: number;
}

export interface RepoSourcesRefreshResult {
  ok: boolean;
  mode: RepoSourcesRefreshMode;
  scope: RepoSourcesOperationScope;
  targetPath: string | null;
  command: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  snapshot: RepoSourcesLatestSnapshot;
  busy: boolean;
}

export interface RepoSourcesConfigUpdateResult {
  ok: boolean;
  command: string;
  durationMs: number;
  entry: RepoSourcesConfigEntry | null;
  snapshot: RepoSourcesLatestSnapshot;
  busy: boolean;
}

function compact(text: string, maxLen = 4000) {
  const normalized = String(text || "").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 3))}...`;
}

function lockFilePath(projectRootPath: string) {
  return path.join(projectRootPath, "reports", "ops", REPO_SOURCES_LOCK_NAME);
}

function withRepoSourcesLock<T>(projectRootPath: string, runner: () => T): { busy: false; value: T } | { busy: true } {
  const lockPath = lockFilePath(projectRootPath);
  if (inFlightLocks.has(lockPath)) {
    return { busy: true };
  }

  inFlightLocks.add(lockPath);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  let fd: number | null = null;
  try {
    fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, `${process.pid}:${new Date().toISOString()}`, "utf8");
  } catch {
    inFlightLocks.delete(lockPath);
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    return { busy: true };
  }

  try {
    const value = runner();
    return { busy: false, value };
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {}
    inFlightLocks.delete(lockPath);
  }
}

function toRepoSourceEntry(entry: RepoSourcesConfigEntry): RepoSourceEntry {
  return {
    name: entry.name,
    path: entry.path,
    remote: entry.remote,
    defaultBranch: entry.defaultBranch,
    track: entry.track !== false,
    enabled: entry.enabled !== false,
    allowDirty: entry.allowDirty === true,
  };
}

function writeTempSingleRegistry(entry: RepoSourcesConfigEntry) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-sources-single-"));
  const filePath = path.join(root, `repo-sources-${randomUUID()}.json`);
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ version: 1, repositories: [toRepoSourceEntry(entry)] }, null, 2)}\n`,
    "utf8",
  );
  return {
    filePath,
    cleanup: () => {
      try {
        fs.unlinkSync(filePath);
      } catch {}
      try {
        fs.rmdirSync(root);
      } catch {}
    },
  };
}

function runSyncByScope(projectRootPath: string, input: RepoSourcesRefreshInput) {
  const apply = input.mode === "update";
  const scope = input.scope || "all";
  const registryPath = getRepoSourcesConfigPath(projectRootPath);
  const reportsDir = getRepoSourcesReportsDir();
  const targetPath =
    scope === "single" ? String(input.targetPath || "").trim().replace(/\\/g, "/") : "";

  if (scope === "single" && !targetPath) {
    return {
      ok: false,
      mode: input.mode,
      scope,
      targetPath: null,
      command: apply ? "npm run ops:repo-sources:update (single)" : "npm run ops:repo-sources:check -- --fetch (single)",
      exitCode: 1,
      stdout: "",
      stderr: "repo_path_required_for_single_scope",
    };
  }

  if (scope === "single") {
    const config = readRepoSourcesConfig(projectRootPath);
    const entry = config.repositories.find(
      (row) => row.path.replace(/\\/g, "/") === targetPath,
    );
    if (!entry) {
      return {
        ok: false,
        mode: input.mode,
        scope,
        targetPath,
        command: apply ? "npm run ops:repo-sources:update (single)" : "npm run ops:repo-sources:check -- --fetch (single)",
        exitCode: 1,
        stdout: "",
        stderr: `repo_entry_not_found:${targetPath}`,
      };
    }

    const temp = writeTempSingleRegistry(entry);
    try {
      const scopedResult = runRepoSourcesSync({
        apply,
        fetch: true,
        registryPath: temp.filePath,
        reportsDir,
        writeLatest: false,
        reportPrefix: "repo-sync-single",
      });

      const refreshAll = runRepoSourcesSync({
        apply: false,
        fetch: true,
        registryPath,
        reportsDir,
      });

      return {
        ok: true,
        mode: input.mode,
        scope,
        targetPath,
        command: apply
          ? `npm run ops:repo-sources:update --single ${targetPath}`
          : `npm run ops:repo-sources:check -- --fetch --single ${targetPath}`,
        exitCode: 0,
        stdout: compact(
          JSON.stringify(
            {
              scopedSummary: scopedResult.summary,
              refreshedSummary: refreshAll.summary,
            },
            null,
            2,
          ),
        ),
        stderr: "",
      };
    } finally {
      temp.cleanup();
    }
  }

  const result = runRepoSourcesSync({
    apply,
    fetch: true,
    registryPath,
    reportsDir,
  });

  return {
    ok: true,
    mode: input.mode,
    scope,
    targetPath: null,
    command: apply ? "npm run ops:repo-sources:update" : "npm run ops:repo-sources:check -- --fetch",
    exitCode: 0,
    stdout: compact(JSON.stringify(result.summary, null, 2)),
    stderr: "",
  };
}

export function runRepoSourcesRefresh(projectRootPath: string, input: RepoSourcesRefreshInput): RepoSourcesRefreshResult {
  const controlPlaneRootPath = getControlPlaneProjectRootPath();
  const startedAt = Date.now();
  const lock = withRepoSourcesLock(controlPlaneRootPath, () => runSyncByScope(controlPlaneRootPath, input));
  if (lock.busy) {
    return {
      ok: false,
      mode: input.mode,
      scope: input.scope || "all",
      targetPath: input.targetPath || null,
      command: "repo_sources_lock",
      exitCode: 423,
      durationMs: Date.now() - startedAt,
      stdout: "",
      stderr: "repo_sources_operation_in_progress",
      snapshot: readRepoSourcesLatestReport({ maxAgeHours: input.maxAgeHours }),
      busy: true,
    };
  }

  return {
    ...lock.value,
    durationMs: Date.now() - startedAt,
    snapshot: readRepoSourcesLatestReport({ maxAgeHours: input.maxAgeHours }),
    busy: false,
  };
}

export function updateRepoSourcesFlags(
  projectRootPath: string,
  input: { repoPath: string; track?: boolean; enabled?: boolean; maxAgeHours?: number },
): RepoSourcesConfigUpdateResult {
  const controlPlaneRootPath = getControlPlaneProjectRootPath();
  const startedAt = Date.now();
  const lock = withRepoSourcesLock(controlPlaneRootPath, () => {
    const updated = updateRepoSourcesConfigEntry(controlPlaneRootPath, input.repoPath, {
      track: input.track,
      enabled: input.enabled,
    });

    runRepoSourcesSync({
      apply: false,
      fetch: true,
      registryPath: getRepoSourcesConfigPath(controlPlaneRootPath),
      reportsDir: getRepoSourcesReportsDir(),
    });

    return updated;
  });

  if (lock.busy) {
    return {
      ok: false,
      command: "repo_sources_lock",
      durationMs: Date.now() - startedAt,
      entry: null,
      snapshot: readRepoSourcesLatestReport({ maxAgeHours: input.maxAgeHours }),
      busy: true,
    };
  }

  return {
    ok: true,
    command: "repo_sources_config_update",
    durationMs: Date.now() - startedAt,
    entry: lock.value.entry,
    snapshot: readRepoSourcesLatestReport({ maxAgeHours: input.maxAgeHours }),
    busy: false,
  };
}

export function buildRepoSourcesOpsReportContent(input: {
  mode: RepoSourcesRefreshMode;
  scope: RepoSourcesOperationScope;
  targetPath: string | null;
  command: string;
  exitCode: number;
  durationMs: number;
  snapshot: RepoSourcesLatestSnapshot;
  stderr?: string;
}) {
  return [
    `Repo sources operation: ${input.mode}`,
    `scope: ${input.scope}`,
    `targetPath: ${input.targetPath || "all"}`,
    `command: ${input.command}`,
    `exitCode: ${input.exitCode}`,
    `durationMs: ${input.durationMs}`,
    "",
    `snapshot generatedAt: ${input.snapshot.generatedAt || "none"}`,
    `snapshot stale: ${input.snapshot.stale}`,
    `blocked: ${input.snapshot.summary.blocked}`,
    `updates: ${input.snapshot.summary.updateAvailable}`,
    `dirtyBlocking: ${input.snapshot.summary.dirtyBlocking}`,
    input.stderr ? `stderr: ${compact(input.stderr, 1200)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
