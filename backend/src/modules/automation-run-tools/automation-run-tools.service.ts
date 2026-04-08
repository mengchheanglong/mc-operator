import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { SqliteService } from "../../infra/sqlite/sqlite.service";
import {
  classifyAgencyAgentsFailure,
  normalizeAgencyAgentsFailureClass,
  runAgencyAgentsSync,
  type AgencyAgentsFailureClass,
  type AgencyAgentsProfile,
} from "./run-scoped-agency-agents-core";
import {
  classifyDesloppifyFailure,
  evaluateLengthGate,
  extractJsonPayload,
  normalizeDesloppifyFailureClass,
  runDesloppifyCommand,
  type DesloppifyFailureClass,
} from "./run-scoped-desloppify-core";
import {
  isDeprecatedRunScopedTool,
  normalizeRunScopedToolInvocation,
  resolveCanonicalRunScopedToolId,
  resolveRunScopedToolId,
} from "./run-scoped-tools-core";
import {
  getWorkspaceRootFromBackendCwd,
  resolveAgencyAgentsSourceRootFromBackendCwd,
  resolveDesloppifySourceRootFromBackendCwd,
} from "../../infra/paths/directive-source-packs";

const DEFAULT_PROJECT_ID = "mission-control";

type WorkspaceRunStatus =
  | "active"
  | "closed"
  | "archived"
  | "error"
  | "closing_pending_cleanup";

interface WorkspaceRunRow {
  id: string;
  userId: string;
  projectId: string;
  worktreePath: string;
  status: WorkspaceRunStatus;
}

interface WorkspaceRunDispatchRow {
  id: string;
  userId: string;
  projectId: string;
  runId: string;
  metadata: Record<string, unknown>;
}

interface ToolInvocationResult {
  ok: boolean;
  runId: string;
  status: "success" | "error";
  failureClass: string | null;
  durationMs: number;
  dispatchId: string;
  artifactPath: string;
  reportId: string | null;
  reportHref: string | null;
  precheck?: {
    minChars: number;
    actualChars: number;
    triggered: boolean;
  };
}

@Injectable()
export class AutomationRunToolsService {
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
    } catch {}
    return {};
  }

  private stringifyJsonObject(value: Record<string, unknown>) {
    return JSON.stringify(value || {});
  }

  private resolveProjectId(projectId?: unknown) {
    return this.s(projectId) || DEFAULT_PROJECT_ID;
  }

  private resolveToolRootPath() {
    return resolveDesloppifySourceRootFromBackendCwd();
  }

  private resolveOpsReportDir() {
    return path.join(getWorkspaceRootFromBackendCwd(), "reports", "ops");
  }

  private resolveAgencySourceRoot() {
    return resolveAgencyAgentsSourceRootFromBackendCwd();
  }

  private resolveAgencyCuratedRoot() {
    return path.join(getWorkspaceRootFromBackendCwd(), "logs", "skills", "agency-agents-curated");
  }

  private resolveAgencySnapshotRoot() {
    return path.join(getWorkspaceRootFromBackendCwd(), "reports", "ops", "agency-agents-snapshots");
  }

  private reportHrefFromDate(date: string) {
    return `/dashboard/report?day=${encodeURIComponent(date.slice(0, 10))}`;
  }

  private normalizeTimeoutMs(value: unknown, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(180_000, Math.max(5_000, Math.floor(parsed)));
  }

  private normalizeMinChars(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(50_000, Math.max(0, Math.floor(parsed)));
  }

  private normalizeAgencyProfile(value: unknown): AgencyAgentsProfile {
    const normalized = this.s(value).toLowerCase();
    if (
      normalized === "all" ||
      normalized === "engineering" ||
      normalized === "testing" ||
      normalized === "product"
    ) {
      return normalized;
    }
    return "all";
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) return undefined;
    const normalized = value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
  }

  private operator() {
    const latest = this.sqlite.connection
      .prepare("SELECT id FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1")
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
      worktreePath: this.s(raw.worktree_path),
      status: (this.s(raw.status) as WorkspaceRunStatus) || "active",
    };
  }

  private toDispatchRow(raw: Record<string, unknown>): WorkspaceRunDispatchRow {
    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      runId: this.s(raw.run_id),
      metadata: this.parseJsonObject(raw.metadata_json),
    };
  }

  private findWorkspaceRunById(userId: string, projectId: string, runId: string) {
    const row = this.sqlite.connection
      .prepare("SELECT * FROM workspace_runs WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1")
      .get(userId, projectId, runId) as Record<string, unknown> | undefined;
    return row ? this.toWorkspaceRunRow(row) : null;
  }

  private createWorkspaceRunDispatch(input: {
    userId: string;
    projectId: string;
    runId: string;
    agentId: string;
    command?: string | null;
    artifactPath?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      user_id: input.userId,
      project_id: input.projectId,
      run_id: input.runId,
      agent_id: input.agentId,
      session_id: null,
      model: null,
      started_at: now,
      finished_at: null,
      status: "running",
      failure_class: null,
      command: input.command || null,
      report_id: null,
      artifact_path: input.artifactPath || null,
      metadata_json: this.stringifyJsonObject(input.metadata || {}),
    };
    this.sqlite.connection
      .prepare(
        "INSERT INTO workspace_run_dispatches (id, user_id, project_id, run_id, agent_id, session_id, model, started_at, finished_at, status, failure_class, command, report_id, artifact_path, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.user_id,
        row.project_id,
        row.run_id,
        row.agent_id,
        row.session_id,
        row.model,
        row.started_at,
        row.finished_at,
        row.status,
        row.failure_class,
        row.command,
        row.report_id,
        row.artifact_path,
        row.metadata_json,
      );
    return this.toDispatchRow(row);
  }

  private updateWorkspaceRunDispatch(
    userId: string,
    projectId: string,
    dispatchId: string,
    updates: {
      status: "success" | "error";
      failureClass: string | null;
      artifactPath: string;
      reportId: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    this.sqlite.connection
      .prepare(
        "UPDATE workspace_run_dispatches SET finished_at = ?, status = ?, failure_class = ?, artifact_path = ?, report_id = ?, metadata_json = ? WHERE user_id = ? AND project_id = ? AND id = ?",
      )
      .run(
        new Date().toISOString(),
        updates.status,
        updates.failureClass,
        updates.artifactPath,
        updates.reportId,
        this.stringifyJsonObject(updates.metadata || {}),
        userId,
        projectId,
        dispatchId,
      );
  }

  private findLatestWorkspaceRunDispatch(userId: string, projectId: string, runId: string) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT * FROM workspace_run_dispatches WHERE user_id = ? AND project_id = ? AND run_id = ? ORDER BY started_at DESC LIMIT 1",
      )
      .get(userId, projectId, runId) as Record<string, unknown> | undefined;
    return row ? this.toDispatchRow(row) : null;
  }

  private createReport(input: {
    userId: string;
    projectId: string;
    title: string;
    content: string;
    status: "success" | "warning";
    metadata?: Record<string, unknown>;
  }) {
    const row = {
      id: randomUUID(),
      user_id: input.userId,
      project_id: input.projectId,
      title: input.title,
      content: input.content,
      category: "maintenance",
      status: input.status,
      area: "runtime-reliability",
      linked_quest_id: null,
      source: "Mission Control",
      metadata_json: this.stringifyJsonObject(input.metadata || {}),
      date: new Date().toISOString(),
    };
    this.sqlite.connection
      .prepare(
        "INSERT INTO reports (id, user_id, project_id, title, content, category, status, area, linked_quest_id, source, metadata_json, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.user_id,
        row.project_id,
        row.title,
        row.content,
        row.category,
        row.status,
        row.area,
        row.linked_quest_id,
        row.source,
        row.metadata_json,
        row.date,
      );
    return { id: row.id, date: row.date };
  }

  private async verifyRunWorktreePath(worktreePath: string) {
    try {
      const info = await stat(worktreePath);
      return info.isDirectory();
    } catch {
      return false;
    }
  }

  private async invokeDesloppifyTool(input: {
    userId: string;
    projectId: string;
    run: WorkspaceRunRow;
    dispatchAgentId: string;
    timeoutMs: number;
    minChars: number;
    content?: string;
  }): Promise<ToolInvocationResult> {
    const precheck = evaluateLengthGate({
      minChars: input.minChars,
      content: input.content,
    });
    const dispatch = this.createWorkspaceRunDispatch({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.run.id,
      agentId: input.dispatchAgentId,
      command: "python -m desloppify status --json",
      artifactPath: input.run.worktreePath,
      metadata: {
        runContext: { runId: input.run.id, worktreePath: input.run.worktreePath },
        precheck,
      },
    });
    const artifactDir = this.resolveOpsReportDir();
    await mkdir(artifactDir, { recursive: true });
    const artifactPath = path.resolve(artifactDir, `${input.dispatchAgentId}-${input.run.id}.md`);

    let failureClass: DesloppifyFailureClass | null = null;
    let status: "success" | "error" = "success";
    let durationMs = 0;
    let content = "# Run-scoped Desloppify\n";

    if (precheck.triggered) {
      content += `\nprecheck: triggered (${precheck.actualChars}/${precheck.minChars})\n`;
    } else {
      const startedAt = Date.now();
      try {
        const result = await runDesloppifyCommand({
          args: ["status", "--json"],
          cwd: input.run.worktreePath,
          timeoutMs: input.timeoutMs,
          toolRootPath: this.resolveToolRootPath(),
        });
        durationMs = Date.now() - startedAt;
        const parsed = extractJsonPayload(result.stdout);
        if (result.timedOut || result.exitCode !== 0) {
          failureClass = classifyDesloppifyFailure(result);
          status = "error";
        } else if (!parsed) {
          failureClass = "parse_failed";
          status = "error";
        }
        content += `\nexitCode: ${result.exitCode}\ntimedOut: ${result.timedOut}\n`;
      } catch (error) {
        durationMs = Date.now() - startedAt;
        failureClass = normalizeDesloppifyFailureClass(error);
        status = "error";
        content += `\nerror: ${error instanceof Error ? error.message : String(error)}\n`;
      }
    }

    await writeFile(artifactPath, content, "utf8");
    const report = this.createReport({
      userId: input.userId,
      projectId: input.projectId,
      title: `Run-scoped ${input.dispatchAgentId}: ${status}`,
      content,
      status: status === "success" ? "success" : "warning",
      metadata: {
        runContext: { runId: input.run.id, worktreePath: input.run.worktreePath },
        dispatchId: dispatch.id,
        artifactPath,
        precheck,
        durationMs,
        failureClass,
      },
    });
    this.updateWorkspaceRunDispatch(input.userId, input.projectId, dispatch.id, {
      status,
      failureClass,
      artifactPath,
      reportId: report.id,
      metadata: {
        ...(dispatch.metadata || {}),
        precheck,
        durationMs,
        failureClass,
        runContext: { runId: input.run.id, worktreePath: input.run.worktreePath },
      },
    });
    return {
      ok: status === "success",
      runId: input.run.id,
      status,
      failureClass,
      durationMs,
      dispatchId: dispatch.id,
      artifactPath,
      reportId: report.id,
      reportHref: this.reportHrefFromDate(report.date),
      precheck,
    };
  }

  private async invokeAgencyAgentsTool(input: {
    userId: string;
    projectId: string;
    run: WorkspaceRunRow;
    timeoutMs: number;
    profile: AgencyAgentsProfile;
    includeDirectories?: string[];
  }): Promise<ToolInvocationResult> {
    const dispatch = this.createWorkspaceRunDispatch({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.run.id,
      agentId: "agency-agents",
      command: `agency-agents sync profile=${input.profile}`,
      artifactPath: input.run.worktreePath,
      metadata: {
        runContext: { runId: input.run.id, worktreePath: input.run.worktreePath },
        profile: input.profile,
      },
    });
    const artifactDir = this.resolveOpsReportDir();
    await mkdir(artifactDir, { recursive: true });
    const artifactPath = path.resolve(artifactDir, `agency-agents-${input.run.id}.md`);

    let failureClass: AgencyAgentsFailureClass | null = null;
    let status: "success" | "error" = "success";
    let durationMs = 0;
    let reportBody = "# Run-scoped Agency Agents\n";

    const sourceRoot = this.resolveAgencySourceRoot();
    if (!existsSync(sourceRoot)) {
      failureClass = "source_missing";
      status = "error";
      reportBody += `\nsource_missing: ${sourceRoot}\n`;
    } else {
      const startedAt = Date.now();
      try {
        const result = await runAgencyAgentsSync({
          sourceRoot,
          targetRoot: this.resolveAgencyCuratedRoot(),
          snapshotRoot: this.resolveAgencySnapshotRoot(),
          timeoutMs: input.timeoutMs,
          profile: input.profile,
          includeDirectories: input.includeDirectories,
        });
        durationMs = result.durationMs;
        reportBody += `\nstatus: success\nmanifestHash: ${result.summary.manifestHash}\n`;
      } catch (error) {
        durationMs = Date.now() - startedAt;
        failureClass = normalizeAgencyAgentsFailureClass(error);
        if (!failureClass) {
          failureClass = classifyAgencyAgentsFailure({ timedOut: true });
        }
        status = "error";
        reportBody += `\nerror: ${error instanceof Error ? error.message : String(error)}\n`;
      }
    }

    await writeFile(artifactPath, reportBody, "utf8");
    const report = this.createReport({
      userId: input.userId,
      projectId: input.projectId,
      title: `Run-scoped agency-agents: ${status}`,
      content: reportBody,
      status: status === "success" ? "success" : "warning",
      metadata: {
        runContext: { runId: input.run.id, worktreePath: input.run.worktreePath },
        dispatchId: dispatch.id,
        artifactPath,
        durationMs,
        failureClass,
      },
    });
    this.updateWorkspaceRunDispatch(input.userId, input.projectId, dispatch.id, {
      status,
      failureClass,
      artifactPath,
      reportId: report.id,
      metadata: {
        ...(dispatch.metadata || {}),
        durationMs,
        failureClass,
        runContext: { runId: input.run.id, worktreePath: input.run.worktreePath },
      },
    });
    return {
      ok: status === "success",
      runId: input.run.id,
      status,
      failureClass,
      durationMs,
      dispatchId: dispatch.id,
      artifactPath,
      reportId: report.id,
      reportHref: this.reportHrefFromDate(report.date),
    };
  }

  async invokeTools(input: {
    projectId?: unknown;
    runId?: unknown;
    toolId: unknown;
    timeoutMs?: unknown;
    minChars?: unknown;
    content?: unknown;
    profile?: unknown;
    includeDirectories?: unknown;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const runId = this.s(input.runId);
    if (!runId) {
      throw new BadRequestException("Run ID is required.");
    }

    const run = this.findWorkspaceRunById(user.id, projectId, runId);
    if (!run || run.status !== "active") {
      throw new Error(`invalid_input: active run not found for runId=${runId}`);
    }
    const worktreeExists = await this.verifyRunWorktreePath(run.worktreePath);
    if (!worktreeExists) {
      throw new Error(`invalid_input: run worktree missing for runId=${runId}`);
    }

    const requestedToolId = resolveRunScopedToolId(input.toolId);
    const canonicalToolId = resolveCanonicalRunScopedToolId(requestedToolId);
    const deprecated = isDeprecatedRunScopedTool(requestedToolId);

    const timeoutMs = this.normalizeTimeoutMs(input.timeoutMs, 45_000);
    const minChars = this.normalizeMinChars(input.minChars);
    const content =
      typeof input.content === "string" ? input.content : undefined;

    let result: ToolInvocationResult;
    if (canonicalToolId === "desloppify-prototype") {
      result = await this.invokeDesloppifyTool({
        userId: user.id,
        projectId,
        run,
        dispatchAgentId:
          requestedToolId === "tooling-audit"
            ? "tooling-audit"
            : "desloppify-prototype",
        timeoutMs,
        minChars,
        content,
      });
    } else if (canonicalToolId === "agency-agents") {
      result = await this.invokeAgencyAgentsTool({
        userId: user.id,
        projectId,
        run,
        timeoutMs,
        profile: this.normalizeAgencyProfile(input.profile),
        includeDirectories: this.normalizeStringArray(input.includeDirectories),
      });
    } else {
      throw new Error(
        `invalid_input: unsupported toolId=${String(
          requestedToolId,
        )}; allowed=tooling-audit,desloppify-prototype,agency-agents`,
      );
    }

    const latestDispatch = this.findLatestWorkspaceRunDispatch(
      user.id,
      projectId,
      runId,
    );
    const normalized = normalizeRunScopedToolInvocation({
      toolId: requestedToolId,
      result,
      dispatch: latestDispatch,
    });

    return {
      requestedToolId,
      canonicalToolId,
      deprecated,
      run: normalized,
    };
  }

  async invokeToolingAudit(input: {
    projectId?: unknown;
    runId?: unknown;
    timeoutMs?: unknown;
    minChars?: unknown;
    content?: unknown;
  }) {
    return this.invokeTools({
      ...input,
      toolId: "tooling-audit",
      timeoutMs: input.timeoutMs,
      minChars: input.minChars,
      content: input.content,
    });
  }
}
