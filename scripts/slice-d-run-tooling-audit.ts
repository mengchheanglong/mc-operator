import { findOrCreateUser } from "../src/server/repositories/users-repo";
import { resolveProjectById } from "../src/server/context/project-context";
import { listRuns, createRun } from "../src/server/services/workspace-run-service";
import { findLatestWorkspaceRunDispatch } from "../src/server/repositories/workspace-run-dispatches-repo";
import { invokeRunScopedToolForRun } from "../src/server/services/run-scoped-tools-service";
import { execSync } from "node:child_process";

async function resolveRunId(userId: string, projectId: string, rootPath: string) {
  const active = listRuns({ userId, projectId }).find((row) => row.status === "active");
  if (active) return active.id;

  const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: rootPath }).toString().trim();
  const run = await createRun({
    userId,
    project: resolveProjectById(projectId),
    branch,
    metadata: { purpose: "slice-d-tooling-audit-compatibility-path" },
  });
  return run.id;
}

async function main() {
  const user = findOrCreateUser();
  const project = resolveProjectById("mission-control");
  const runId = await resolveRunId(user.id, project.id, project.rootPath);
  const toolId = "tooling-audit" as const;

  const result = await invokeRunScopedToolForRun({
    userId: user.id,
    projectId: project.id,
    runId,
    toolId,
    timeoutMs: 45_000,
  });

  const latest = findLatestWorkspaceRunDispatch(user.id, project.id, runId);

  console.log(JSON.stringify({
    compatibilityPath: true,
    requestedToolId: toolId,
    canonicalToolId: result.canonicalToolId,
    deprecated: result.deprecated,
    runId,
    result,
    latestDispatch: latest,
  }, null, 2));

  if (result.status !== "success") {
    process.exitCode = 1;
  }
}

void main();
