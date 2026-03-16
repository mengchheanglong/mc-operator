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
  updateWorkspaceRun,
} from "@/server/repositories/workspace-runs-repo";

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
  const branch = input.branch.trim();
  if (!branch) {
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
      throw new WorkspaceRunError({
        message: "Failed to create worktree.",
        reason: "git_worktree_add_failed",
        nextCommand: `git -C "${input.project.rootPath}" worktree add --detach "${worktreePath}" "${branch}"`,
        artifactPath: worktreePath,
        status: 502,
      });
    }
  }

  return createWorkspaceRun({
    userId: input.userId,
    projectId: input.project.id,
    branch,
    worktreePath,
    metadata: { ...(input.metadata || {}), runId },
  });
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
    throw new WorkspaceRunError({
      message: "Run not found.",
      reason: "run_not_found",
      nextCommand: "List runs and retry with a valid run id.",
      artifactPath: resolveWorktreeRoot(input.project),
      status: 404,
    });
  }

  if (run.status !== "active") {
    return run;
  }

  const shouldArchive = input.archive !== false;
  const archiveRoot = resolveArchiveRoot(input.project);
  const archivePath = path.join(archiveRoot, `${path.basename(run.worktreePath)}-${Date.now()}`);

  try {
    await runGit(input.project.rootPath, ["worktree", "remove", run.worktreePath, "--force"]);
  } catch {
    throw new WorkspaceRunError({
      message: "Failed to remove git worktree.",
      reason: "git_worktree_remove_failed",
      nextCommand: `git -C "${input.project.rootPath}" worktree remove "${run.worktreePath}" --force`,
      artifactPath: run.worktreePath,
      status: 502,
    });
  }

  let finalStatus: "closed" | "archived" = "closed";
  let finalPath = run.worktreePath;

  if (shouldArchive) {
    try {
      await mkdir(archiveRoot, { recursive: true });
      await rename(run.worktreePath, archivePath);
      finalStatus = "archived";
      finalPath = archivePath;
    } catch {
      // worktree remove usually deletes folder; best effort archive fallback
      try {
        await rm(run.worktreePath, { recursive: true, force: true });
      } catch {}
    }
  }

  return updateWorkspaceRun(input.userId, input.project.id, run.id, {
    status: finalStatus,
    closedAt: new Date().toISOString(),
    worktreePath: finalPath,
    metadata: {
      ...run.metadata,
      closedFrom: run.worktreePath,
      archived: finalStatus === "archived",
      closeReason: input.reason || "manual",
    },
  });
}
