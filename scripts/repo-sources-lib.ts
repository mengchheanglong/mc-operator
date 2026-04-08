import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface RepoSourceEntry {
  name: string;
  path: string;
  remote?: string;
  defaultBranch?: string;
  track?: boolean;
  enabled?: boolean;
  allowDirty?: boolean;
}

export interface RepoSourcesConfig {
  version: 1;
  repositories: RepoSourceEntry[];
}

export type RepoSyncState =
  | "update_available"
  | "updated"
  | "up_to_date"
  | "skipped_disabled"
  | "skipped_tracking_off"
  | "skipped_dirty"
  | "skipped_dirty_allowed"
  | "skipped_no_tracking"
  | "skipped_diverged"
  | "missing_path"
  | "not_git"
  | "fetch_failed"
  | "pull_failed";

export interface RepoSyncResult {
  name: string;
  path: string;
  remote: string;
  defaultBranch: string;
  enabled: boolean;
  track: boolean;
  allowDirty: boolean;
  state: RepoSyncState;
  currentBranch: string | null;
  upstream: string | null;
  remoteUrl: string | null;
  dirty: boolean | null;
  ahead: number | null;
  behind: number | null;
  headBefore: string | null;
  headAfter: string | null;
  command: string | null;
  error: string | null;
  durationMs: number;
}

export interface RepoSourcesSyncOptions {
  apply: boolean;
  fetch?: boolean;
  registryPath?: string;
  workspaceRoot?: string;
  reportsDir?: string;
  writeLatest?: boolean;
  reportPrefix?: string;
}

interface CommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_REMOTE = "origin";
const DEFAULT_BRANCH = "main";

function compact(text: string, maxLen = 800) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLen - 3))}...`;
}

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function normalizePath(input: string) {
  return path.resolve(input).replace(/\\/g, "/").toLowerCase();
}

function runGit(args: string[], cwd: string, timeoutMs = 120_000): CommandResult {
  const proc = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
  });
  const code = proc.status ?? 1;
  const stdout = String(proc.stdout || "").trim();
  const stderr = String(proc.stderr || "").trim();
  return {
    ok: code === 0,
    code,
    stdout,
    stderr,
  };
}

function resolveGitRepoRoot(cwd: string) {
  const result = runGit(["rev-parse", "--show-toplevel"], cwd, 30_000);
  if (!result.ok || !result.stdout) {
    return null;
  }

  return result.stdout;
}

function requirePathInput(input: string | undefined, errorCode: string) {
  const normalized = String(input || "").trim();
  if (!normalized) {
    throw new Error(errorCode);
  }
  return path.resolve(normalized);
}

function resolveRegistryPath(input?: string) {
  return requirePathInput(input, "repo_sources_registry_path_required");
}

function resolveWorkspaceRoot(registryPath: string, input?: string) {
  return input ? path.resolve(input) : path.dirname(registryPath);
}

function resolveReportsDir(input?: string) {
  return requirePathInput(input, "repo_sources_reports_dir_required");
}

function readConfig(registryPath: string): RepoSourcesConfig {
  if (!fs.existsSync(registryPath)) {
    throw new Error(
      `missing_registry: ${registryPath} (run "npm run ops:repo-sources:seed" first)`,
    );
  }

  const raw = fs.readFileSync(registryPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<RepoSourcesConfig>;
  if (parsed.version !== 1 || !Array.isArray(parsed.repositories)) {
    throw new Error(`invalid_registry: expected { version: 1, repositories: [] } in ${registryPath}`);
  }

  return {
    version: 1,
    repositories: parsed.repositories.map((entry) => ({
      name: String(entry?.name || ""),
      path: String(entry?.path || ""),
      remote: entry?.remote ? String(entry.remote) : undefined,
      defaultBranch: entry?.defaultBranch ? String(entry.defaultBranch) : undefined,
      track: entry?.track !== false,
      enabled: entry?.enabled !== false,
      allowDirty: entry?.allowDirty === true,
    })),
  };
}

function parseAheadBehind(input: string) {
  const [leftRaw, rightRaw] = input.trim().split(/\s+/);
  const left = Number(leftRaw || 0);
  const right = Number(rightRaw || 0);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return { behind: null, ahead: null };
  }
  return { behind: left, ahead: right };
}

function resolveAbsoluteRepoPath(entryPath: string, workspaceRoot: string) {
  return path.isAbsolute(entryPath)
    ? path.resolve(entryPath)
    : path.resolve(workspaceRoot, entryPath);
}

function syncOneRepo(entry: RepoSourceEntry, options: RepoSourcesSyncOptions, workspaceRoot: string): RepoSyncResult {
  const startedAt = Date.now();
  const absolutePath = resolveAbsoluteRepoPath(entry.path, workspaceRoot);
  const remote = (entry.remote || DEFAULT_REMOTE).trim() || DEFAULT_REMOTE;
  const defaultBranch = (entry.defaultBranch || DEFAULT_BRANCH).trim() || DEFAULT_BRANCH;
  const enabled = entry.enabled !== false;
  const track = entry.track !== false;
  const allowDirty = entry.allowDirty === true;

  const base: RepoSyncResult = {
    name: entry.name || path.basename(absolutePath),
    path: absolutePath,
    remote,
    defaultBranch,
    enabled,
    track,
    allowDirty,
    state: "up_to_date",
    currentBranch: null,
    upstream: null,
    remoteUrl: null,
    dirty: null,
    ahead: null,
    behind: null,
    headBefore: null,
    headAfter: null,
    command: null,
    error: null,
    durationMs: 0,
  };

  const finish = (update: Partial<RepoSyncResult>): RepoSyncResult => ({
    ...base,
    ...update,
    durationMs: Date.now() - startedAt,
  });

  if (!enabled) {
    return finish({ state: "skipped_disabled" });
  }

  if (!fs.existsSync(absolutePath)) {
    return finish({ state: "missing_path", error: `path_missing: ${absolutePath}` });
  }

  const gitRepoRoot = resolveGitRepoRoot(absolutePath);
  if (!gitRepoRoot || normalizePath(gitRepoRoot) !== normalizePath(absolutePath)) {
    return finish({
      state: "not_git",
      error: compact(
        gitRepoRoot
          ? `not_git_repo_root: ${absolutePath} (git_root=${gitRepoRoot})`
          : "not_git",
      ),
    });
  }

  const branchCheck = runGit(["rev-parse", "--abbrev-ref", "HEAD"], absolutePath, 30_000);
  const headBeforeCheck = runGit(["rev-parse", "HEAD"], absolutePath, 30_000);
  const remoteUrlCheck = runGit(["remote", "get-url", remote], absolutePath, 30_000);
  const dirtyCheck = runGit(["status", "--porcelain"], absolutePath, 45_000);
  const upstreamCheck = runGit(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    absolutePath,
    30_000,
  );

  const currentBranch = branchCheck.ok ? branchCheck.stdout : null;
  const headBefore = headBeforeCheck.ok ? headBeforeCheck.stdout : null;
  const remoteUrl = remoteUrlCheck.ok ? remoteUrlCheck.stdout : null;
  const dirty = dirtyCheck.ok ? dirtyCheck.stdout.length > 0 : null;
  const upstream = upstreamCheck.ok ? upstreamCheck.stdout : null;

  let compareRef: string | null = upstream;
  if (!compareRef) {
    const remoteBranchRef = `refs/remotes/${remote}/${defaultBranch}`;
    const hasRemoteBranch = runGit(
      ["rev-parse", "--verify", "--quiet", remoteBranchRef],
      absolutePath,
      30_000,
    );
    if (hasRemoteBranch.ok) {
      compareRef = `${remote}/${defaultBranch}`;
    }
  }

  if (options.fetch !== false && track) {
    const fetchCheck = runGit(["fetch", "--all", "--prune"], absolutePath, 120_000);
    if (!fetchCheck.ok) {
      return finish({
        state: "fetch_failed",
        currentBranch,
        headBefore,
        remoteUrl,
        dirty,
        upstream,
        error: compact(fetchCheck.stderr || fetchCheck.stdout),
      });
    }
  }

  let ahead: number | null = null;
  let behind: number | null = null;
  if (compareRef) {
    const aheadBehindCheck = runGit(
      ["rev-list", "--left-right", "--count", `${compareRef}...HEAD`],
      absolutePath,
      45_000,
    );
    if (aheadBehindCheck.ok) {
      const parsed = parseAheadBehind(aheadBehindCheck.stdout);
      ahead = parsed.ahead;
      behind = parsed.behind;
    }
  }

  if (!track) {
    return finish({
      state: "skipped_tracking_off",
      currentBranch,
      headBefore,
      remoteUrl,
      dirty,
      upstream,
      ahead,
      behind,
    });
  }

  if (dirty) {
    return finish({
      state: allowDirty ? "skipped_dirty_allowed" : "skipped_dirty",
      currentBranch,
      headBefore,
      remoteUrl,
      dirty,
      upstream,
      ahead,
      behind,
    });
  }

  if (!compareRef || behind === null || ahead === null) {
    return finish({
      state: "skipped_no_tracking",
      currentBranch,
      headBefore,
      remoteUrl,
      dirty,
      upstream,
      ahead,
      behind,
      error: compareRef ? "unable_to_compute_ahead_behind" : "missing_compare_ref",
    });
  }

  if (ahead > 0 && behind > 0) {
    return finish({
      state: "skipped_diverged",
      currentBranch,
      headBefore,
      remoteUrl,
      dirty,
      upstream,
      ahead,
      behind,
    });
  }

  if (!options.apply) {
    return finish({
      state: behind > 0 ? "update_available" : "up_to_date",
      currentBranch,
      headBefore,
      headAfter: headBefore,
      remoteUrl,
      dirty,
      upstream,
      ahead,
      behind,
    });
  }

  if (behind <= 0) {
    return finish({
      state: "up_to_date",
      currentBranch,
      headBefore,
      headAfter: headBefore,
      remoteUrl,
      dirty,
      upstream,
      ahead,
      behind,
    });
  }

  let pullArgs: string[] = ["pull", "--ff-only"];
  if (!upstream) {
    if (!currentBranch || currentBranch !== defaultBranch) {
      return finish({
        state: "skipped_no_tracking",
        currentBranch,
        headBefore,
        headAfter: headBefore,
        remoteUrl,
        dirty,
        upstream,
        ahead,
        behind,
        error: `no_upstream_and_not_on_default_branch:${defaultBranch}`,
      });
    }
    pullArgs = ["pull", "--ff-only", remote, defaultBranch];
  }

  const pullCheck = runGit(pullArgs, absolutePath, 180_000);
  if (!pullCheck.ok) {
    return finish({
      state: "pull_failed",
      currentBranch,
      headBefore,
      headAfter: headBefore,
      remoteUrl,
      dirty,
      upstream,
      ahead,
      behind,
      command: `git ${pullArgs.join(" ")}`,
      error: compact(pullCheck.stderr || pullCheck.stdout),
    });
  }

  const headAfterCheck = runGit(["rev-parse", "HEAD"], absolutePath, 30_000);
  const headAfter = headAfterCheck.ok ? headAfterCheck.stdout : headBefore;
  return finish({
    state: headBefore && headAfter && headBefore !== headAfter ? "updated" : "up_to_date",
    currentBranch,
    headBefore,
    headAfter,
    remoteUrl,
    dirty,
    upstream,
    ahead,
    behind,
    command: `git ${pullArgs.join(" ")}`,
  });
}

export function runRepoSourcesSync(options: RepoSourcesSyncOptions) {
  const startedAt = new Date();
  const registryPath = resolveRegistryPath(options.registryPath);
  const workspaceRoot = resolveWorkspaceRoot(registryPath, options.workspaceRoot);
  const reportsDir = resolveReportsDir(options.reportsDir);
  const config = readConfig(registryPath);
  const results = config.repositories.map((entry) => syncOneRepo(entry, options, workspaceRoot));

  const countsByState = results.reduce<Record<string, number>>((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, {});

  const summary = {
    total: results.length,
    enabled: results.filter((item) => item.enabled).length,
    updateAvailable: results.filter((item) => item.state === "update_available").length,
    updated: results.filter((item) => item.state === "updated").length,
    upToDate: results.filter((item) => item.state === "up_to_date").length,
    dirtyAllowed: results.filter((item) => item.state === "skipped_dirty_allowed").length,
    dirtyBlocking: results.filter((item) => item.state === "skipped_dirty").length,
    blocked: results.filter((item) =>
      ["pull_failed", "fetch_failed", "missing_path", "not_git"].includes(item.state),
    ).length,
    skipped: results.filter((item) => item.state.startsWith("skipped_")).length,
  };

  const payload = {
    generatedAt: startedAt.toISOString(),
    apply: options.apply,
    fetch: options.fetch !== false,
    workspaceRoot,
    registryPath,
    summary,
    countsByState,
    repositories: results,
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = toTimestampForFile(startedAt);
  const reportPrefix = options.reportPrefix?.trim() || "repo-sync";
  const timestamped = path.join(reportsDir, `${reportPrefix}-${stamp}.json`);
  const latest = path.join(reportsDir, `${reportPrefix}-latest.json`);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(timestamped, serialized, "utf8");
  if (options.writeLatest !== false) {
    fs.writeFileSync(latest, serialized, "utf8");
  }

  return {
    ...payload,
    reports: { timestamped, latest },
  };
}
