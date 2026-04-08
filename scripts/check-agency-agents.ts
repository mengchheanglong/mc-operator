import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { findOrCreateUser } from "../src/server/repositories/users-repo";
import { findActiveWorkspaceRunByBranch } from "../src/server/repositories/workspace-runs-repo";
import { resolveProjectById } from "../src/server/context/project-context";
import { createRun, listRuns } from "../src/server/services/workspace-run-service";
import { findLatestWorkspaceRunDispatch } from "../src/server/repositories/workspace-run-dispatches-repo";
import { invokeRunScopedToolForRun } from "../src/server/services/run-scoped-tools-service";

async function resolveRunId(userId: string, projectId: string, rootPath: string) {
  const branch = execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: rootPath,
    encoding: "utf8",
  }).trim();
  const activeOnBranch = findActiveWorkspaceRunByBranch(userId, projectId, branch);
  if (activeOnBranch) return activeOnBranch.id;

  const active = listRuns({ userId, projectId }).find((row) => row.status === "active");
  if (active) return active.id;

  const run = await createRun({
    userId,
    project: resolveProjectById(projectId),
    branch,
    metadata: { purpose: "check-agency-agents" },
  });
  return run.id;
}

async function main() {
  const user = findOrCreateUser();
  const project = resolveProjectById("mission-control");
  const runId = await resolveRunId(user.id, project.id, project.rootPath);

  const syncResult = await invokeRunScopedToolForRun({
    userId: user.id,
    projectId: project.id,
    runId,
    toolId: "agency-agents",
    action: "sync",
    profile: "engineering",
    timeoutMs: 60_000,
    writeReport: false,
    reportContext: "Automated health check for run-scoped agency-agents.",
  });
  const syncDispatch = findLatestWorkspaceRunDispatch(user.id, project.id, runId);
  const syncMetadata = (syncDispatch?.metadata || {}) as Record<string, unknown>;
  const syncSummary = (syncMetadata.sync || {}) as Record<string, unknown>;
  const postSnapshot = (syncSummary.postSnapshot || {}) as Record<string, unknown>;
  const postSnapshotId = String(postSnapshot.snapshotId || "");

  const rollbackResult = await invokeRunScopedToolForRun({
    userId: user.id,
    projectId: project.id,
    runId,
    toolId: "agency-agents",
    action: "rollback",
    dryRun: true,
    timeoutMs: 60_000,
    writeReport: false,
    reportContext: "Automated health check for run-scoped agency-agents.",
  });
  const rollbackDispatch = findLatestWorkspaceRunDispatch(user.id, project.id, runId);
  const rollbackMetadata = (rollbackDispatch?.metadata || {}) as Record<string, unknown>;
  const rollbackSummary = (rollbackMetadata.rollback || {}) as Record<string, unknown>;

  const ok =
    syncResult.status === "success" &&
    syncResult.toolId === "agency-agents" &&
    !!syncResult.artifactPath &&
    existsSync(syncResult.artifactPath) &&
    rollbackResult.status === "success" &&
    rollbackResult.toolId === "agency-agents" &&
    !!rollbackSummary.manifestHash &&
    !!rollbackSummary.restoredSnapshot;

  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        runId,
        sync: {
          status: syncResult.status,
          dispatchId: syncResult.dispatchId,
          reportId: syncResult.reportId,
          artifactPath: syncResult.artifactPath,
          latestDispatchAgentId: syncDispatch?.agentId || null,
          profile: String(syncSummary.profile || ""),
          selectedDirectories: Array.isArray(syncSummary.selectedDirectories)
            ? syncSummary.selectedDirectories
            : [],
          manifestHash: String(syncSummary.manifestHash || ""),
          postSnapshotId: postSnapshotId || null,
        },
        rollbackDryRun: {
          status: rollbackResult.status,
          dispatchId: rollbackResult.dispatchId,
          reportId: rollbackResult.reportId,
          latestDispatchAgentId: rollbackDispatch?.agentId || null,
          manifestHash: String(rollbackSummary.manifestHash || ""),
          restoredSnapshotId: String(
            ((rollbackSummary.restoredSnapshot || {}) as Record<string, unknown>)
              .snapshotId || "",
          ),
        },
      },
      null,
      2,
    )}\n`,
  );

  if (!ok) process.exit(1);
}

void main();
