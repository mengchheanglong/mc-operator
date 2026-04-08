import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findWorkspaceRunById } from "../repositories/workspace-runs-repo.ts";
import {
  createWorkspaceRunDispatch,
  updateWorkspaceRunDispatch,
} from "../repositories/workspace-run-dispatches-repo.ts";
import { createReport, type ReportStatus } from "../repositories/reports-repo.ts";
import { verifyRunWorktreePath } from "./workspace-run-service.ts";
import { resolveAgencyAgentsSourceRoot } from "@/server/paths/directive-source-packs";
import {
  classifyAgencyAgentsFailure,
  normalizeAgencyAgentsFailureClass,
  runAgencyAgentsRollback,
  runAgencyAgentsSync,
  type AgencyAgentsFailureClass,
  type AgencyAgentsProfile,
  type AgencyAgentsRollbackResult,
  type AgencyAgentsRollbackSummary,
  type AgencyAgentsSyncResult,
  type AgencyAgentsSyncSummary,
} from "./run-scoped-agency-agents-core.ts";

export {
  classifyAgencyAgentsFailure,
  normalizeAgencyAgentsFailureClass,
  runAgencyAgentsRollback,
  runAgencyAgentsSync,
};
export type {
  AgencyAgentsFailureClass,
  AgencyAgentsProfile,
  AgencyAgentsRollbackResult,
  AgencyAgentsRollbackSummary,
  AgencyAgentsSyncResult,
  AgencyAgentsSyncSummary,
};

export interface AgencyAgentsRunResult {
  ok: boolean;
  runId: string;
  dispatchId: string;
  artifactPath: string;
  reportId: string | null;
  reportHref: string | null;
  durationMs: number;
  failureClass: AgencyAgentsFailureClass | null;
  status: "success" | "error";
  action: "sync" | "rollback";
  sync: AgencyAgentsSyncSummary | null;
  rollback: AgencyAgentsRollbackSummary | null;
}

function reportHrefFromDate(date: string) {
  return `/dashboard/report?day=${encodeURIComponent(date.slice(0, 10))}`;
}

function normalizeProfile(input: unknown): AgencyAgentsProfile {
  const value = String(input || "all").trim().toLowerCase();
  if (value === "engineering" || value === "testing" || value === "product" || value === "all") {
    return value;
  }
  throw new Error(`invalid_input: unsupported agency-agents profile=${value || "(empty)"}`);
}

function normalizeIncludeDirectories(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
}

function summarizeTaskContext(input: {
  action: "sync" | "rollback";
  profile?: string;
  reportContext?: string;
  runId: string;
}) {
  const context = String(input.reportContext || "").trim();
  if (context) return context;
  const profile = String(input.profile || "all");
  if (input.action === "sync") {
    return `Run-scoped agency-agents sync validation (profile=${profile}) for run ${input.runId}.`;
  }
  return `Run-scoped agency-agents rollback validation for run ${input.runId}.`;
}

function createAgencyAgentsReport(input: {
  userId: string;
  projectId: string;
  runId: string;
  dispatchId: string;
  worktreePath: string;
  artifactPath: string;
  status: "success" | "error";
  failureClass: AgencyAgentsFailureClass | null;
  durationMs: number;
  action: "sync" | "rollback";
  sync: AgencyAgentsSyncSummary | null;
  rollback: AgencyAgentsRollbackSummary | null;
  reportContext?: string;
  error?: string;
}) {
  const reportStatus: ReportStatus =
    input.status === "success" ? "success" : "warning";
  const taskContext = summarizeTaskContext({
    action: input.action,
    profile: input.sync?.profile,
    reportContext: input.reportContext,
    runId: input.runId,
  });
  const content = [
    "# Run-scoped Agency Agents",
    "",
    "## Task Context",
    `- summary: ${taskContext}`,
    "",
    "## Execution",
    `- runId: ${input.runId}`,
    `- dispatchId: ${input.dispatchId}`,
    `- action: ${input.action}`,
    `- status: ${input.status}`,
    `- failureClass: ${input.failureClass ?? "none"}`,
    `- durationMs: ${input.durationMs}`,
    `- artifactPath: ${input.artifactPath}`,
    input.sync ? `- profile: ${input.sync.profile}` : "",
    input.sync ? `- selectedDirectories: ${input.sync.selectedDirectories.join(", ") || "(none)"}` : "",
    input.sync ? `- manifestHash: ${input.sync.manifestHash}` : "",
    input.sync ? `- manifestPath: ${input.sync.manifestPath}` : "",
    input.sync ? `- files: ${input.sync.fileCount}` : "",
    input.sync ? `- markdownFiles: ${input.sync.markdownFiles}` : "",
    input.sync ? `- preSnapshot: ${input.sync.preSnapshot?.snapshotId || "none"}` : "",
    input.sync ? `- postSnapshot: ${input.sync.postSnapshot?.snapshotId || "none"}` : "",
    input.rollback ? `- rollbackDryRun: ${input.rollback.dryRun}` : "",
    input.rollback ? `- rollbackSnapshot: ${input.rollback.restoredSnapshot.snapshotId}` : "",
    input.rollback ? `- rollbackManifestHash: ${input.rollback.manifestHash}` : "",
    input.rollback ? `- rollbackManifestPath: ${input.rollback.manifestPath}` : "",
    input.error ? `\n## Error\n${input.error}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return createReport(input.userId, input.projectId, {
    title: `Run-scoped agency-agents ${input.action}: ${input.status}`,
    content,
    category: "maintenance",
    status: reportStatus,
    area: "runtime-reliability",
    source: "Mission Control",
    topics: ["agency-agents", "directive-workspace", "workspace-runs"],
    metadata: {
      runContext: {
        runId: input.runId,
        worktreePath: input.worktreePath,
      },
      dispatchId: input.dispatchId,
      artifactPath: input.artifactPath,
      failureClass: input.failureClass,
      durationMs: input.durationMs,
      status: input.status,
      action: input.action,
      sync: input.sync,
      rollback: input.rollback,
    },
  });
}

export async function invokeAgencyAgentsForRun(input: {
  userId: string;
  projectId: string;
  runId: string;
  timeoutMs?: number;
  sourceRootPath?: string;
  curatedRootPath?: string;
  snapshotRootPath?: string;
  action?: "sync" | "rollback";
  profile?: AgencyAgentsProfile | string;
  includeDirectories?: string[];
  rollbackSnapshotId?: string;
  dryRun?: boolean;
  writeReport?: boolean;
  reportContext?: string;
}): Promise<AgencyAgentsRunResult> {
  const timeoutMs = input.timeoutMs ?? 45_000;
  const action = input.action === "rollback" ? "rollback" : "sync";
  const sourceRootPath =
    input.sourceRootPath ?? resolveAgencyAgentsSourceRoot();
  const curatedRootPath =
    input.curatedRootPath ??
    path.resolve(process.cwd(), "..", "logs", "skills", "agency-agents-curated");
  const snapshotRootPath =
    input.snapshotRootPath ??
    path.resolve(process.cwd(), "reports", "ops", "agency-agents-snapshots");
  const profile = normalizeProfile(input.profile);
  const includeDirectories = normalizeIncludeDirectories(input.includeDirectories);
  const dryRun = Boolean(input.dryRun);
  const writeReport = input.writeReport !== false;
  const reportContext = String(input.reportContext || "").trim();

  const run = findWorkspaceRunById(input.userId, input.projectId, input.runId);
  if (!run || run.status !== "active") {
    throw new Error(`invalid_input: active run not found for runId=${input.runId}`);
  }

  const worktreeExists = await verifyRunWorktreePath(run.worktreePath);
  if (!worktreeExists) {
    throw new Error(`invalid_input: run worktree missing for runId=${input.runId}`);
  }

  const command =
    action === "sync"
      ? `agency-agents curated sync (profile=${profile})`
      : `agency-agents curated rollback${dryRun ? " --dry-run" : ""}`;

  const dispatch = createWorkspaceRunDispatch({
    userId: input.userId,
    projectId: input.projectId,
    runId: input.runId,
    agentId: "agency-agents",
    status: "running",
    command,
    artifactPath: run.worktreePath,
    metadata: {
      source: "slice-f",
      toolPath: "directive-workspace/forge/source-packs/agency-agents",
      runContext: { runId: run.id, worktreePath: run.worktreePath },
      action,
      profile,
      includeDirectories,
      rollbackSnapshotId: input.rollbackSnapshotId || null,
      dryRun,
      writeReport,
      reportContext,
      sourceRootPath,
      curatedRootPath,
      snapshotRootPath,
    },
  });

  const artifactDir = path.resolve(process.cwd(), "reports", "ops");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.resolve(
    artifactDir,
    `agency-agents-${action}-${input.runId}.md`,
  );

  try {
    const execution = action === "sync"
      ? await runAgencyAgentsSync({
          sourceRoot: sourceRootPath,
          targetRoot: curatedRootPath,
          snapshotRoot: snapshotRootPath,
          timeoutMs,
          profile,
          includeDirectories,
        })
      : await runAgencyAgentsRollback({
          targetRoot: curatedRootPath,
          snapshotRoot: snapshotRootPath,
          timeoutMs,
          snapshotId: input.rollbackSnapshotId,
          dryRun,
        });

    const sync = execution.action === "sync" ? execution.summary : null;
    const rollback = execution.action === "rollback" ? execution.summary : null;
    const markdown = [
      "# Run-scoped Agency Agents",
      "",
      `- runId: ${input.runId}`,
      `- dispatchId: ${dispatch.id}`,
      `- action: ${execution.action}`,
      "- status: success",
      `- durationMs: ${execution.durationMs}`,
      sync ? `- profile: ${sync.profile}` : "",
      sync ? `- selectedDirectories: ${sync.selectedDirectories.join(", ") || "(none)"}` : "",
      sync ? `- manifestHash: ${sync.manifestHash}` : "",
      sync ? `- manifestPath: ${sync.manifestPath}` : "",
      sync ? `- changes.added: ${sync.changes.added}` : "",
      sync ? `- changes.removed: ${sync.changes.removed}` : "",
      sync ? `- changes.modified: ${sync.changes.modified}` : "",
      sync ? `- preSnapshot: ${sync.preSnapshot?.snapshotId || "none"}` : "",
      sync ? `- postSnapshot: ${sync.postSnapshot?.snapshotId || "none"}` : "",
      rollback ? `- rollbackDryRun: ${rollback.dryRun}` : "",
      rollback ? `- rollbackSnapshot: ${rollback.restoredSnapshot.snapshotId}` : "",
      rollback ? `- rollbackManifestHash: ${rollback.manifestHash}` : "",
      rollback ? `- rollbackManifestPath: ${rollback.manifestPath}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await writeFile(artifactPath, markdown, "utf8");

    const report = writeReport
      ? createAgencyAgentsReport({
          userId: input.userId,
          projectId: input.projectId,
          runId: input.runId,
          dispatchId: dispatch.id,
          worktreePath: run.worktreePath,
          artifactPath,
          status: "success",
          failureClass: null,
          durationMs: execution.durationMs,
          action: execution.action,
          sync,
          rollback,
          reportContext,
        })
      : null;

    updateWorkspaceRunDispatch(input.userId, input.projectId, dispatch.id, {
      finishedAt: new Date().toISOString(),
      status: "success",
      failureClass: null,
      artifactPath,
      reportId: report?.id ?? null,
      metadata: {
        ...(dispatch.metadata || {}),
        durationMs: execution.durationMs,
        action: execution.action,
        sync,
        rollback,
        reportSuppressed: !writeReport,
        reportContext: reportContext || null,
        runContext: { runId: run.id, worktreePath: run.worktreePath },
      },
    });

    return {
      ok: true,
      runId: input.runId,
      dispatchId: dispatch.id,
      artifactPath,
      reportId: report?.id ?? null,
      reportHref: report ? reportHrefFromDate(report.date) : null,
      durationMs: execution.durationMs,
      failureClass: null,
      status: "success",
      action: execution.action,
      sync,
      rollback,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureClass = normalizeAgencyAgentsFailureClass(error);
    await writeFile(
      artifactPath,
      `# Run-scoped Agency Agents\n\naction: ${action}\nrunId: ${input.runId}\nstatus: error\nfailureClass: ${failureClass}\n\n${message}\n`,
      "utf8",
    );

    const report = writeReport
      ? createAgencyAgentsReport({
          userId: input.userId,
          projectId: input.projectId,
          runId: input.runId,
          dispatchId: dispatch.id,
          worktreePath: run.worktreePath,
          artifactPath,
          status: "error",
          failureClass,
          durationMs: 0,
          action,
          sync: null,
          rollback: null,
          reportContext,
          error: message,
        })
      : null;

    updateWorkspaceRunDispatch(input.userId, input.projectId, dispatch.id, {
      finishedAt: new Date().toISOString(),
      status: "error",
      failureClass,
      artifactPath,
      reportId: report?.id ?? null,
      metadata: {
        ...(dispatch.metadata || {}),
        action,
        error: message,
        reportSuppressed: !writeReport,
        reportContext: reportContext || null,
        runContext: { runId: run.id, worktreePath: run.worktreePath },
      },
    });

    return {
      ok: false,
      runId: input.runId,
      dispatchId: dispatch.id,
      artifactPath,
      reportId: report?.id ?? null,
      reportHref: report ? reportHrefFromDate(report.date) : null,
      durationMs: 0,
      failureClass,
      status: "error",
      action,
      sync: null,
      rollback: null,
    };
  }
}
