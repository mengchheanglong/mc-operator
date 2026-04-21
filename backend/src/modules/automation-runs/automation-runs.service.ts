import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { SqliteService } from "../../infra/sqlite/sqlite.service";

const execFileAsync = promisify(execFile);
const DEFAULT_PROJECT_ID = "mc-operator";

export type WorkspaceRunStatus =
  | "active"
  | "closed"
  | "archived"
  | "error"
  | "closing_pending_cleanup";

export type WorkspaceRunCloseReason = "manual" | "stale" | "error-recovery";

interface WorkspaceRunRow {
  id: string;
  userId: string;
  projectId: string;
  branch: string;
  worktreePath: string;
  status: WorkspaceRunStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  closedAt: string | null;
}

interface WorkspaceRunDispatchRow {
  id: string;
  userId: string;
  projectId: string;
  runId: string;
  agentId: string;
  sessionId: string | null;
  model: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  failureClass: string | null;
  command: string | null;
  reportId: string | null;
  artifactPath: string | null;
  metadata: Record<string, unknown>;
}

export class WorkspaceRunError extends Error {
  reason: string;
  nextCommand: string;
  artifactPath: string;
  status: number;

  constructor(input: {
    message: string;
    reason: string;
    nextCommand: string;
    artifactPath: string;
    status?: number;
  }) {
    super(input.message);
    this.reason = input.reason;
    this.nextCommand = input.nextCommand;
    this.artifactPath = input.artifactPath;
    this.status = input.status ?? 400;
  }
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function classifyWorktreeRemoveFailure(errorText: string) {
  const normalized = errorText.toLowerCase();
  if (
    normalized.includes("not a working tree") ||
    normalized.includes("is not a working tree") ||
    normalized.includes("already gone") ||
    normalized.includes("cannot find")
  ) {
    return "missing";
  }
  if (
    normalized.includes("access is denied") ||
    normalized.includes("permission denied") ||
    normalized.includes("in use by another process") ||
    normalized.includes("directory not empty")
  ) {
    return "locked";
  }
  return "generic";
}

function computeCleanupRetryDelayMs(attempts: number) {
  if (!Number.isFinite(attempts) || attempts <= 1) return 30_000;
  return Math.min(15 * 60_000, 30_000 * Math.pow(2, attempts - 1));
}

@Injectable()
export class AutomationRunsService {
  constructor(private readonly sqlite: SqliteService) {}

  private s(value: unknown) {
    return String(value ?? "").trim();
  }

  private parseJsonObject(value: unknown): Record<string, unknown> {
    if (typeof value !== "string" || !value.trim()) return {};
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private stringifyJsonObject(value: Record<string, unknown>) {
    return JSON.stringify(value || {});
  }

  private resolveProjectId(projectId?: unknown) {
    return this.s(projectId) || DEFAULT_PROJECT_ID;
  }

  private operator() {
    const latest = this.sqlite.connection
      .prepare(
        "SELECT id FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1",
      )
      .get() as Record<string, unknown> | undefined;
    if (latest) {
      return { id: this.s(latest.id) };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare(
        "INSERT INTO users (id, name, timezone, join_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, "Operator", "Asia/Bangkok", now, now, now);
    return { id };
  }

  private toWorkspaceRunRow(raw: Record<string, unknown>): WorkspaceRunRow {
    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      branch: this.s(raw.branch),
      worktreePath: this.s(raw.worktree_path),
      status:
        (this.s(raw.status) as WorkspaceRunStatus) ||
        "active",
      metadata: this.parseJsonObject(raw.metadata_json),
      createdAt: this.s(raw.created_at),
      closedAt: this.s(raw.closed_at) || null,
    };
  }

  private toDispatchRow(raw: Record<string, unknown>): WorkspaceRunDispatchRow {
    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      runId: this.s(raw.run_id),
      agentId: this.s(raw.agent_id),
      sessionId: this.s(raw.session_id) || null,
      model: this.s(raw.model) || null,
      startedAt: this.s(raw.started_at),
      finishedAt: this.s(raw.finished_at) || null,
      status: this.s(raw.status),
      failureClass: this.s(raw.failure_class) || null,
      command: this.s(raw.command) || null,
      reportId: this.s(raw.report_id) || null,
      artifactPath: this.s(raw.artifact_path) || null,
      metadata: this.parseJsonObject(raw.metadata_json),
    };
  }

  private findWorkspaceRunById(userId: string, projectId: string, runId: string) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT * FROM workspace_runs WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1",
      )
      .get(userId, projectId, runId) as Record<string, unknown> | undefined;
    return row ? this.toWorkspaceRunRow(row) : null;
  }

  private listWorkspaceRuns(userId: string, projectId: string, limit = 100) {
    const rows = this.sqlite.connection
      .prepare(
        "SELECT * FROM workspace_runs WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(userId, projectId, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.toWorkspaceRunRow(row));
  }

  private findActiveWorkspaceRunByBranch(
    userId: string,
    projectId: string,
    branch: string,
  ) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT * FROM workspace_runs WHERE user_id = ? AND project_id = ? AND branch = ? AND status = 'active' LIMIT 1",
      )
      .get(userId, projectId, branch) as Record<string, unknown> | undefined;
    return row ? this.toWorkspaceRunRow(row) : null;
  }

  private createWorkspaceRun(input: {
    userId: string;
    projectId: string;
    branch: string;
    worktreePath: string;
    status?: WorkspaceRunStatus;
    metadata?: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      user_id: input.userId,
      project_id: input.projectId,
      branch: input.branch,
      worktree_path: input.worktreePath,
      status: input.status || "active",
      metadata_json: this.stringifyJsonObject(input.metadata || {}),
      created_at: now,
      closed_at: input.status && input.status !== "active" ? now : null,
    };
    this.sqlite.connection
      .prepare(
        "INSERT INTO workspace_runs (id, user_id, project_id, branch, worktree_path, status, metadata_json, created_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.user_id,
        row.project_id,
        row.branch,
        row.worktree_path,
        row.status,
        row.metadata_json,
        row.created_at,
        row.closed_at,
      );
    return this.toWorkspaceRunRow(row);
  }

  private updateWorkspaceRun(
    userId: string,
    projectId: string,
    runId: string,
    updates: {
      status?: WorkspaceRunStatus;
      metadata?: Record<string, unknown>;
      closedAt?: string | null;
      worktreePath?: string;
    },
  ) {
    const assignments: string[] = [];
    const params: Array<unknown> = [];
    if (updates.status !== undefined) {
      assignments.push("status = ?");
      params.push(updates.status);
    }
    if (updates.metadata !== undefined) {
      assignments.push("metadata_json = ?");
      params.push(this.stringifyJsonObject(updates.metadata));
    }
    if (updates.closedAt !== undefined) {
      assignments.push("closed_at = ?");
      params.push(updates.closedAt);
    }
    if (updates.worktreePath !== undefined) {
      assignments.push("worktree_path = ?");
      params.push(updates.worktreePath);
    }
    if (assignments.length === 0) {
      return this.findWorkspaceRunById(userId, projectId, runId);
    }
    params.push(userId, projectId, runId);
    this.sqlite.connection
      .prepare(
        `UPDATE workspace_runs SET ${assignments.join(", ")} WHERE user_id = ? AND project_id = ? AND id = ?`,
      )
      .run(...params);
    return this.findWorkspaceRunById(userId, projectId, runId);
  }

  private findLatestWorkspaceRunDispatch(
    userId: string,
    projectId: string,
    runId: string,
  ) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT * FROM workspace_run_dispatches WHERE user_id = ? AND project_id = ? AND run_id = ? ORDER BY started_at DESC LIMIT 1",
      )
      .get(userId, projectId, runId) as Record<string, unknown> | undefined;
    return row ? this.toDispatchRow(row) : null;
  }

  private findReportById(userId: string, projectId: string, reportId: string) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT id, date FROM reports WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1",
      )
      .get(userId, projectId, reportId) as
      | { id?: string; date?: string }
      | undefined;
    if (!row) return null;
    return {
      id: this.s(row.id),
      date: this.s(row.date),
    };
  }

  private resolveControlPlaneRoot() {
    const cwd = process.cwd();
    if (path.basename(cwd).toLowerCase() === "backend") {
      return path.resolve(cwd, "..");
    }
    return cwd;
  }

  private resolveWorkspaceRoot() {
    if (process.env.OPENCLAW_WORKSPACE_ROOT?.trim()) {
      return path.resolve(process.env.OPENCLAW_WORKSPACE_ROOT.trim());
    }
    const controlPlaneRoot = this.resolveControlPlaneRoot();
    const parent = path.resolve(controlPlaneRoot, "..");
    return fs.existsSync(parent) ? parent : controlPlaneRoot;
  }

  private resolveProjectRoot(projectId: string) {
    const workspaceRoot = this.resolveWorkspaceRoot();
    const candidate = path.resolve(workspaceRoot, projectId);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const controlPlaneRoot = this.resolveControlPlaneRoot();
    if (this.s(path.basename(controlPlaneRoot)) === projectId) {
      return controlPlaneRoot;
    }
    return path.resolve(workspaceRoot, DEFAULT_PROJECT_ID);
  }

  private resolveWorktreeRoot(projectRoot: string) {
    return path.join(projectRoot, ".openclaw", "runs");
  }

  private resolveArchiveRoot(projectRoot: string) {
    return path.join(projectRoot, ".openclaw", "runs-archive");
  }

  private async runGit(projectRoot: string, args: string[]) {
    return execFileAsync("git", args, {
      cwd: projectRoot,
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  }

  private formatGitError(error: unknown) {
    if (error && typeof error === "object") {
      const maybeError = error as {
        stderr?: string;
        stdout?: string;
        message?: string;
      };
      return (
        this.s(maybeError.stderr) ||
        this.s(maybeError.stdout) ||
        this.s(maybeError.message) ||
        "git command failed"
      );
    }
    return this.s(error) || "git command failed";
  }

  private extractCleanupAttempts(metadata: Record<string, unknown>) {
    const value = metadata.cleanupAttempts;
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    return 0;
  }

  private async removeWorktreeWithPolicy(projectRoot: string, worktreePath: string) {
    try {
      await this.runGit(projectRoot, ["worktree", "remove", worktreePath, "--force"]);
      return { ok: true as const, kind: "removed" as const, errorText: "" };
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error || "");
      const kind = classifyWorktreeRemoveFailure(errorText);
      if (kind === "missing") {
        return { ok: true as const, kind: "missing" as const, errorText };
      }
      return { ok: false as const, kind, errorText };
    }
  }

  private async finalizeRunAsClosed(input: {
    userId: string;
    projectId: string;
    run: WorkspaceRunRow;
    projectRoot: string;
    reason: WorkspaceRunCloseReason;
    archive: boolean;
  }) {
    const archiveRoot = this.resolveArchiveRoot(input.projectRoot);
    const archivePath = path.join(
      archiveRoot,
      `${path.basename(input.run.worktreePath)}-${Date.now()}`,
    );
    let finalStatus: WorkspaceRunStatus = "closed";
    let finalPath = input.run.worktreePath;

    if (input.archive) {
      try {
        await mkdir(archiveRoot, { recursive: true });
        await rename(input.run.worktreePath, archivePath);
        finalStatus = "archived";
        finalPath = archivePath;
      } catch {
        try {
          await rm(input.run.worktreePath, { recursive: true, force: true });
        } catch {}
      }
    }

    return this.updateWorkspaceRun(input.userId, input.projectId, input.run.id, {
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

  private normalizeMetadata(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  async retryPendingRunCleanups(input: {
    userId: string;
    projectId: string;
    projectRoot: string;
    limit?: number;
  }) {
    const now = Date.now();
    const candidates = this.listWorkspaceRuns(input.userId, input.projectId, 200)
      .filter((run) => run.status === "closing_pending_cleanup")
      .slice(0, input.limit ?? 10);

    let recovered = 0;
    let stillPending = 0;

    for (const run of candidates) {
      const nextRetryAt =
        typeof run.metadata.cleanupNextRetryAt === "string"
          ? Date.parse(run.metadata.cleanupNextRetryAt)
          : Number.NaN;
      if (Number.isFinite(nextRetryAt) && nextRetryAt > now) {
        stillPending += 1;
        continue;
      }

      const result = await this.removeWorktreeWithPolicy(
        input.projectRoot,
        run.worktreePath,
      );
      if (result.ok) {
        await this.finalizeRunAsClosed({
          userId: input.userId,
          projectId: input.projectId,
          run,
          projectRoot: input.projectRoot,
          archive: false,
          reason:
            (run.metadata.closeReason as WorkspaceRunCloseReason) || "manual",
        });
        recovered += 1;
        continue;
      }

      const attempts = this.extractCleanupAttempts(run.metadata) + 1;
      const delayMs = computeCleanupRetryDelayMs(attempts);
      this.updateWorkspaceRun(input.userId, input.projectId, run.id, {
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

  detectStaleRuns(input: {
    userId: string;
    projectId: string;
    maxAgeHours?: number;
    maxInactiveHours?: number;
  }) {
    const maxAgeMs = (input.maxAgeHours ?? 24) * 60 * 60 * 1000;
    const maxInactiveMs = (input.maxInactiveHours ?? 6) * 60 * 60 * 1000;
    const now = Date.now();

    return this.listWorkspaceRuns(input.userId, input.projectId, 200)
      .filter((run) => run.status === "active")
      .filter((run) => {
        const createdAtMs = Date.parse(run.createdAt);
        const lastDispatchAt =
          typeof run.metadata.lastDispatchAt === "string"
            ? Date.parse(run.metadata.lastDispatchAt)
            : Number.NaN;
        const ageStale = Number.isFinite(createdAtMs)
          ? now - createdAtMs > maxAgeMs
          : false;
        const inactiveStale = Number.isFinite(lastDispatchAt)
          ? now - lastDispatchAt > maxInactiveMs
          : false;
        return ageStale || inactiveStale;
      });
  }

  async listRuns(input: { projectId?: unknown }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const projectRoot = this.resolveProjectRoot(projectId);
    await this.retryPendingRunCleanups({
      userId: user.id,
      projectId,
      projectRoot,
      limit: 8,
    });
    const runs = this.listWorkspaceRuns(user.id, projectId, 100);
    const staleRuns = this.detectStaleRuns({ userId: user.id, projectId }).map(
      (row) => row.id,
    );
    return { runs, staleRuns };
  }

  async createRun(input: {
    projectId?: unknown;
    branch?: unknown;
    metadata?: unknown;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const projectRoot = this.resolveProjectRoot(projectId);

    await this.retryPendingRunCleanups({
      userId: user.id,
      projectId,
      projectRoot,
      limit: 8,
    });

    const branch = this.s(input.branch);
    if (!branch) {
      throw new WorkspaceRunError({
        message: "Branch is required.",
        reason: "missing_branch",
        nextCommand: "Provide a branch name and retry create.",
        artifactPath: this.resolveWorktreeRoot(projectRoot),
        status: 422,
      });
    }

    const duplicate = this.findActiveWorkspaceRunByBranch(
      user.id,
      projectId,
      branch,
    );
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
    const worktreeRoot = this.resolveWorktreeRoot(projectRoot);
    const worktreePath = path.join(
      worktreeRoot,
      `${slug(branch)}-${runId.slice(0, 8)}`,
    );

    await mkdir(worktreeRoot, { recursive: true });

    try {
      await this.runGit(projectRoot, ["check-ref-format", "--branch", branch]);
    } catch {
      throw new WorkspaceRunError({
        message: "Branch name is invalid.",
        reason: "invalid_branch",
        nextCommand:
          "Use a valid git branch name and retry create (example: feature/manual-test-probe).",
        artifactPath: worktreeRoot,
        status: 422,
      });
    }

    const createAttempts = [
      {
        args: ["worktree", "add", worktreePath, branch],
        nextCommand: `git -C "${projectRoot}" worktree add "${worktreePath}" "${branch}"`,
      },
      {
        args: ["worktree", "add", "-b", branch, worktreePath, "HEAD"],
        nextCommand: `git -C "${projectRoot}" worktree add -b "${branch}" "${worktreePath}" HEAD`,
      },
      {
        args: ["worktree", "add", "--detach", worktreePath, branch],
        nextCommand: `git -C "${projectRoot}" worktree add --detach "${worktreePath}" "${branch}"`,
      },
    ] as const;

    let createOk = false;
    let lastNextCommand = createAttempts[createAttempts.length - 1].nextCommand;
    let lastErrorText = "";

    for (const attempt of createAttempts) {
      try {
        await this.runGit(projectRoot, [...attempt.args]);
        createOk = true;
        break;
      } catch (error) {
        lastNextCommand = attempt.nextCommand;
        lastErrorText = this.formatGitError(error);
      }
    }

    if (!createOk) {
      throw new WorkspaceRunError({
        message: `Failed to create worktree. ${lastErrorText}`,
        reason: "git_worktree_add_failed",
        nextCommand: lastNextCommand,
        artifactPath: worktreePath,
        status: 502,
      });
    }

    return this.createWorkspaceRun({
      userId: user.id,
      projectId,
      branch,
      worktreePath,
      metadata: {
        ...this.normalizeMetadata(input.metadata),
        runId,
      },
    });
  }

  async closeRun(input: {
    projectId?: unknown;
    runId?: unknown;
    archive?: boolean;
    reason?: WorkspaceRunCloseReason;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const projectRoot = this.resolveProjectRoot(projectId);
    const runId = this.s(input.runId);
    if (!runId) {
      throw new WorkspaceRunError({
        message: "Run ID is required.",
        reason: "run_id_required",
        nextCommand: "Provide a run ID and retry close.",
        artifactPath: this.resolveWorktreeRoot(projectRoot),
        status: 422,
      });
    }

    const run = this.findWorkspaceRunById(user.id, projectId, runId);
    if (!run) {
      throw new WorkspaceRunError({
        message: "Run not found.",
        reason: "run_not_found",
        nextCommand: "List runs and retry with a valid run id.",
        artifactPath: this.resolveWorktreeRoot(projectRoot),
        status: 404,
      });
    }

    const shouldArchive = input.archive !== false;
    const closeReason = input.reason || "manual";

    if (run.status === "closing_pending_cleanup") {
      await this.retryPendingRunCleanups({
        userId: user.id,
        projectId,
        projectRoot,
        limit: 1,
      });
      return this.findWorkspaceRunById(user.id, projectId, run.id) || run;
    }

    if (run.status !== "active") {
      return run;
    }

    const removal = await this.removeWorktreeWithPolicy(
      projectRoot,
      run.worktreePath,
    );
    if (!removal.ok) {
      const attempts = this.extractCleanupAttempts(run.metadata) + 1;
      const delayMs = computeCleanupRetryDelayMs(attempts);
      return this.updateWorkspaceRun(user.id, projectId, run.id, {
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
          closeDegradedCommand: `git -C "${projectRoot}" worktree remove "${run.worktreePath}" --force`,
        },
      });
    }

    return this.finalizeRunAsClosed({
      userId: user.id,
      projectId,
      run,
      projectRoot,
      archive: shouldArchive,
      reason: closeReason,
    });
  }

  getRunSummary(input: { projectId?: unknown; runId?: unknown }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const runId = this.s(input.runId);
    if (!runId) {
      throw new BadRequestException("Run ID is required.");
    }

    const run = this.findWorkspaceRunById(user.id, projectId, runId);
    if (!run) {
      return null;
    }

    const lastDispatch = this.findLatestWorkspaceRunDispatch(user.id, projectId, runId);
    const report = lastDispatch?.reportId
      ? this.findReportById(user.id, projectId, lastDispatch.reportId)
      : null;

    return {
      run,
      summary: {
        lastDispatch,
        verificationArtifacts: {
          reportId: report?.id || null,
          reportHref: report?.date
            ? `/dashboard/report?day=${encodeURIComponent(report.date.slice(0, 10))}`
            : null,
          lastCommandStatus: lastDispatch?.status || null,
          artifactPath: lastDispatch?.artifactPath || null,
        },
      },
    };
  }
}

