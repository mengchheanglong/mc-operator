import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { findOrCreateUser } from "../src/server/repositories/users-repo";
import { resolveProjectById } from "../src/server/context/project-context";
import { createRun, listRuns } from "../src/server/services/workspace-run-service";
import { findLatestWorkspaceRunDispatch } from "../src/server/repositories/workspace-run-dispatches-repo";
import { invokeRunScopedToolForRun } from "../src/server/services/run-scoped-tools-service";

async function resolveRunId(userId: string, projectId: string, rootPath: string) {
  const active = listRuns({ userId, projectId }).find((row) => row.status === "active");
  if (active) return active.id;

  const branch = execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: rootPath,
    encoding: "utf8",
  }).trim();
  const run = await createRun({
    userId,
    project: resolveProjectById(projectId),
    branch,
    metadata: { purpose: "slice-f-agency-agents-sync" },
  });
  return run.id;
}

async function main() {
  const user = findOrCreateUser();
  const project = resolveProjectById("mission-control");
  const runId = await resolveRunId(user.id, project.id, project.rootPath);

  const result = await invokeRunScopedToolForRun({
    userId: user.id,
    projectId: project.id,
    runId,
    toolId: "agency-agents",
    action: "sync",
    profile: "engineering",
    timeoutMs: 60_000,
  });

  const latest = findLatestWorkspaceRunDispatch(user.id, project.id, runId);
  const verified =
    result.status === "success" &&
    result.toolId === "agency-agents" &&
    !!result.reportId &&
    !!result.artifactPath &&
    existsSync(result.artifactPath);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: verified,
        runId,
        result,
        latestDispatch: latest,
      },
      null,
      2,
    )}\n`,
  );

  if (!verified) {
    process.exitCode = 1;
  }
}

void main();
