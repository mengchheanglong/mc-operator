import { mkdir, rename, rm, stat } from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import type { WorkspaceProject } from "@/server/projects/workspace-projects";
import {
  createWorkspaceRun,
  findActiveWorkspaceRunByBranch,
  findWorkspaceRunById,
  listWorkspaceRuns,
  type WorkspaceRunRow,
  updateWorkspaceRun,
} from "@/server/repositories/workspace-runs-repo";
import {
  recordCloseOutcome,
  recordCreateOutcome,
} from "@/server/repositories/orchestrator-reliability-repo";
import {
  classifyWorktreeRemoveFailure,
  computeCleanupRetryDelayMs,
} from "@/server/services/workspace-run-close-policy";

const execFileAsync = promisify(execFile);

export class WorkspaceRunError extends Error {
  reason: string;
  nextCommand: string;
  artifactPath: string;
  status: number;

  constructor(input: { message: string; reason: string; nextCommand: string; artifactPath: string; status?: number }) {
    super(input.message);
    this.reason = input.reason;
    this.nextCommand = input.nextCommand;
    this.artifactPath = input.artifactPath;
    this.status = input.status ?? 400;
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
}

function resolveWorktreeRoot(project: WorkspaceProject) {
  return path.join(project.rootPath, ".openclaw", "runs");
}

function resolveArchiveRoot(project: WorkspaceProject) {
  return path.join(project.rootPath, ".openclaw", "runs-archive");
}

async function runGit(projectRoot: string, args: string[]) {
  return execFileAsync("git", args, {
    cwd: projectRoot,
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 4,
  });
}

function extractCleanupAttempts(metadata: Record<string, unknown>) {
  const value = metadata.cleanupAttempts;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return 0;
}

async function removeWorktreeWithPolicy(projectRoot: string, worktreePath: string) {
  try {
    await runGit(projectRoot, ["worktree", "remove", worktreePath, "--force"]);
    return { ok: true as const, kind: "removed" as const, errorText: "" };
  } catch (error) {
    const kind = classifyWorktreeRemoveFailure(error);
    const errorText = error instanceof Error ? error.message : String(error || "");
    if (kind === "missing") {
      return { ok: true as const, kind: "missing" as const, errorText };
    }
    return { ok: false as const, kind, errorText };
  }
}

async function finalizeRunAsClosed(input: {
  userId: string;
  project: WorkspaceProject;
  run: WorkspaceRunRow;
  reason: WorkspaceRunCloseReason;
  archive: boolean;
}) {
  const archiveRoot = resolveArchiveRoot(input.project);
  const archivePath = path.join(archiveRoot, `${path.basename(input.run.worktreePath)}-${Date.now()}`);
  let finalStatus: "closed" | "archived" = "closed";
  let finalPath = input.run.worktreePath;

  if (input.archive) {
    try {
      await mkdir(archiveRoot, { recursive: true });
      await rename(input.run.worktreePath, archivePath);
      finalStatus = "archived";
      finalPath = archivePath;
    } catch {
      // worktree remove usually deletes folder; best effort archive fallback
      try {
        await rm(input.run.worktreePath, { recursive: true, force: true });
      } catch {}
    }
  }

  return updateWorkspaceRun(input.userId, input.project.id, input.run.id, {
    status: finalStatus,
    closedAt: new Date().toISOString(),
    worktreePath: finalPath,
    metadata: {
      ...input.run.metadata,
      cleanupPending: false,
      cleanupLastError: null,
      cleanupNextRetryAt: null,
      closedFrom: input.run.worktreePath,
      archived: finalStatus === "archived",
      closeReason: input.reason,
    },
  });
}

export function listRuns(input: { userId: string; projectId: string }) {
  return listWorkspaceRuns(input.userId, input.projectId, 100);
}

export async function verifyRunWorktreePath(worktreePath: string) {
  try {
    const info = await stat(worktreePath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export async function retryPendingRunCleanups(input: { userId: string; project: WorkspaceProject; limit?: number }) {
  const now = Date.now();
  const candidates = listWorkspaceRuns(input.userId, input.project.id, 200)
    .filter((run) => run.status === "closing_pending_cleanup")
    .slice(0, input.limit ?? 10);

  let recovered = 0;
  let stillPending = 0;

  for (const run of candidates) {
    const nextRetryAt = typeof run.metadata.cleanupNextRetryAt === "string"
      ? Date.parse(run.metadata.cleanupNextRetryAt)
      : Number.NaN;
    if (Number.isFinite(nextRetryAt) && nextRetryAt > now) {
      stillPending += 1;
      continue;
    }

    const result = await removeWorktreeWithPolicy(input.project.rootPath, run.worktreePath);
    if (result.ok) {
      await finalizeRunAsClosed({
        userId: input.userId,
        project: input.project,
        run,
        archive: false,
        reason: (run.metadata.closeReason as WorkspaceRunCloseReason) || "manual",
      });
      recovered += 1;
      continue;
    }

    const attempts = extractCleanupAttempts(run.metadata) + 1;
    const delayMs = computeCleanupRetryDelayMs(attempts);
    updateWorkspaceRun(input.userId, input.project.id, run.id, {
      status: "closing_pending_cleanup",
      closedAt: run.closedAt || new Date().toISOString(),
      metadata: {
        ...run.metadata,
        cleanupPending: true,
        cleanupAttempts: attempts,
        cleanupFailureClass: result.kind,
        cleanupLastError: result.errorText || "worktree cleanup retry failed",
        cleanupNextRetryAt: new Date(Date.now() + delayMs).toISOString(),
      },
    });
    stillPending += 1;
  }

  return { recovered, stillPending, scanned: candidates.length };
}

export function detectStaleRuns(input: { userId: string; projectId: string; maxAgeHours?: number; maxInactiveHours?: number }) {
  const maxAgeMs = (input.maxAgeHours ?? 24) * 60 * 60 * 1000;
  const maxInactiveMs = (input.maxInactiveHours ?? 6) * 60 * 60 * 1000;
  const now = Date.now();

  return listWorkspaceRuns(input.userId, input.projectId, 200)
    .filter((run) => run.status === "active")
    .filter((run) => {
      const createdAtMs = Date.parse(run.createdAt);
      const lastDispatchAt = typeof run.metadata.lastDispatchAt === "string" ? Date.parse(run.metadata.lastDispatchAt) : Number.NaN;
      const ageStale = Number.isFinite(createdAtMs) ? now - createdAtMs > maxAgeMs : false;
      const inactiveStale = Number.isFinite(lastDispatchAt) ? now - lastDispatchAt > maxInactiveMs : false;
      return ageStale || inactiveStale;
    });
}

export async function createRun(input: {
  userId: string;
  project: WorkspaceProject;
  branch: string;
  metadata?: Record<string, unknown>;
}) {
  await retryPendingRunCleanups({ userId: input.userId, project: input.project, limit: 8 });

  const branch = input.branch.trim();
  if (!branch) {
    recordCreateOutcome(input.userId, input.project.id, false);
    throw new WorkspaceRunError({
      message: "Branch is required.",
      reason: "missing_branch",
      nextCommand: "Provide a branch name and retry create.",
      artifactPath: path.join(input.project.rootPath, ".openclaw", "runs"),
      status: 422,
    });
  }

  const duplicate = findActiveWorkspaceRunByBranch(input.userId, input.project.id, branch);
  if (duplicate) {
    recordCreateOutcome(input.userId, input.project.id, false);
    throw new WorkspaceRunError({
      message: "An active run already exists for this branch.",
      reason: "duplicate_active_branch_run",
      nextCommand: `Close run ${duplicate.id} first, or choose another branch.`,
      artifactPath: duplicate.worktreePath,
      status: 409,
    });
  }

  const runId = randomUUID();
  const worktreeRoot = resolveWorktreeRoot(input.project);
  const worktreePath = path.join(worktreeRoot, `${slug(branch)}-${runId.slice(0, 8)}`);

  await mkdir(worktreeRoot, { recursive: true });

  try {
    await runGit(input.project.rootPath, ["worktree", "add", worktreePath, branch]);
  } catch {
    try {
      await runGit(input.project.rootPath, ["worktree", "add", "--detach", worktreePath, branch]);
    } catch {
      recordCreateOutcome(input.userId, input.project.id, false);
      throw new WorkspaceRunError({
        message: "Failed to create worktree.",
        reason: "git_worktree_add_failed",
        nextCommand: `git -C "${input.project.rootPath}" worktree add --detach "${worktreePath}" "${branch}"`,
        artifactPath: worktreePath,
        status: 502,
      });
    }
  }

  const created = createWorkspaceRun({
    userId: input.userId,
    projectId: input.project.id,
    branch,
    worktreePath,
    metadata: { ...(input.metadata || {}), runId },
  });
  recordCreateOutcome(input.userId, input.project.id, true);
  return created;
}

export type WorkspaceRunCloseReason = "manual" | "stale" | "error-recovery";

export async function closeRun(input: {
  userId: string;
  project: WorkspaceProject;
  runId: string;
  archive?: boolean;
  reason?: WorkspaceRunCloseReason;
}) {
  const run = findWorkspaceRunById(input.userId, input.project.id, input.runId);
  if (!run) {
    recordCloseOutcome(input.userId, input.project.id, false, input.reason);
    throw new WorkspaceRunError({
      message: "Run not found.",
      reason: "run_not_found",
      nextCommand: "List runs and retry with a valid run id.",
      artifactPath: resolveWorktreeRoot(input.project),
      status: 404,
    });
  }

  const shouldArchive = input.archive !== false;
  const closeReason = input.reason || "manual";

  if (run.status === "closing_pending_cleanup") {
    const retried = await retryPendingRunCleanups({
      userId: input.userId,
      project: input.project,
      limit: 1,
    });
    const refreshed = findWorkspaceRunById(input.userId, input.project.id, run.id);
    if (refreshed) return refreshed;
    if (retried.recovered > 0) {
      const closed = findWorkspaceRunById(input.userId, input.project.id, run.id);
      if (closed) return closed;
    }
    return run;
  }

  if (run.status !== "active") {
    return run;
  }

  const removal = await removeWorktreeWithPolicy(input.project.rootPath, run.worktreePath);
  if (!removal.ok) {
    const attempts = extractCleanupAttempts(run.metadata) + 1;
    const delayMs = computeCleanupRetryDelayMs(attempts);
    const pending = updateWorkspaceRun(input.userId, input.project.id, run.id, {
      status: "closing_pending_cleanup",
      closedAt: new Date().toISOString(),
      metadata: {
        ...run.metadata,
        cleanupPending: true,
        cleanupFailureClass: removal.kind,
        cleanupLastError: removal.errorText || "git worktree remove failed",
        cleanupAttempts: attempts,
        cleanupNextRetryAt: new Date(Date.now() + delayMs).toISOString(),
        closeReason,
        closeDegraded: true,
        closeDegradedCommand: `git -C "${input.project.rootPath}" worktree remove "${run.worktreePath}" --force`,
      },
    });
    recordCloseOutcome(input.userId, input.project.id, true, input.reason);
    return pending;
  }

  const updated = await finalizeRunAsClosed({
    userId: input.userId,
    project: input.project,
    run,
    archive: shouldArchive,
    reason: closeReason,
  });
  recordCloseOutcome(input.userId, input.project.id, true, input.reason);
  return updated;
}
