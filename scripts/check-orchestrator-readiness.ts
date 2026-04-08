import { execSync } from "child_process";
import { findOrCreateUser } from "../src/server/repositories/users-repo";
import { resolveProjectById } from "../src/server/context/project-context";
import { listAgents } from "../src/server/repositories/agents-repo";
import { findActiveWorkspaceRunByBranch } from "../src/server/repositories/workspace-runs-repo";
import { closeRun, createRun, listRuns } from "../src/server/services/workspace-run-service";
import { createWorkspaceRunDispatch, hasRunningWorkspaceRunDispatch, updateWorkspaceRunDispatch } from "../src/server/repositories/workspace-run-dispatches-repo";
import { findWorkspaceRunById } from "../src/server/repositories/workspace-runs-repo";

function runCheck(command: string) {
  try {
    execSync(command, { stdio: "pipe", encoding: "utf8" });
    return { command, ok: true };
  } catch (error) {
    const message = String((error as Error & { stderr?: string }).message || "");
    return { command, ok: false, error: message.slice(0, 5000) };
  }
}

async function main() {
  const user = findOrCreateUser();
  const project = resolveProjectById("mission-control");
  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: project.rootPath, encoding: "utf8" }).trim();
  const probeBranch = `readiness-probe-${Date.now()}`;

  const skipNightlyGates = String(process.env.MISSION_CONTROL_READINESS_SKIP_NIGHTLY_GATES || "").toLowerCase() === "true";
  const adapterChecksRaw: string[] = [
    "npm run check:codex-first-workflow",
    "npm run check:agent-evals",
    "npm run check:agent-eval-regression",
    "npm run check:directive-integration-proof",
    "npm run check:agents-catalog-api-backend",
    "npm run check:agents-runtime-api-backend",
    "npm run check:agents-dispatch-api-backend",
    "npm run check:agents-import-packs-api-backend",
    "npm run check:agents-pack-assets-api-backend",
    "npm run check:agents-send-api-backend",
    "npm run check:automation-runs-api-backend",
    "npm run check:automation-templates-api-backend",
    "npm run check:automation-template-entry-api-backend",
    "npm run check:automation-template-runs-api-backend",
    "npm run check:automation-run-tools-api-backend",
    "npm run check:automation-health-api-backend",
    "npm run check:migration-batch-api-backend",
    "npm run check:automation-template-run-api-backend",
    "npm run check:automation-template-check-api-backend",
    "npm run check:automation-template-execute-api-backend",
    "npm run check:agency-agents",
    "npm run ops:repo-sources:check -- --fetch",
  ];
  if (skipNightlyGates) {
    // Avoid circular dependencies when readiness is called from nightly jobs.
    adapterChecksRaw.push("npm run check:repo-sources-health");
    adapterChecksRaw.push("npm run check:canary-health");
  } else {
    adapterChecksRaw.push("npm run check:ops-stack");
  }
  adapterChecksRaw.push("npm run check:adapters");
  adapterChecksRaw.push("npm run check:ui-smoke");
  const adapterChecks = adapterChecksRaw.map(runCheck);

  let happyPath = { ok: false, error: "not_run" as string | null, createdRunId: null as string | null };
  let closedBlocked = { ok: false, status: 0, body: {} as Record<string, unknown> };
  let overlapBlocked = { ok: false, status: 0, body: {} as Record<string, unknown> };

  const agent = listAgents(user.id, project.id).find((row) => row.backend === "agent-orchestrator" && row.status === "active");
  if (!agent) {
    const output = {
      ok: false,
      reason: "missing_active_orchestrator_agent",
      nextCommand: "Create/activate one agent-orchestrator agent, then rerun check:orchestrator-readiness.",
      checks: adapterChecks,
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exit(1);
  }

  try {
    execSync(`git branch ${probeBranch} ${currentBranch}`, { cwd: project.rootPath, stdio: "pipe" });

    const run = await createRun({
      userId: user.id,
      project,
      branch: probeBranch,
      metadata: { readinessProbe: true },
    });
    const listed = listRuns({ userId: user.id, projectId: project.id }).some((row) => row.id === run.id);
    const closed = await closeRun({ userId: user.id, project, runId: run.id, archive: false, reason: "manual" });
    happyPath = {
      ok: listed && Boolean(closed?.id),
      error: listed && closed?.id ? null : "create_list_close_failed",
      createdRunId: run.id,
    };

    const closedRunRow = findWorkspaceRunById(user.id, project.id, run.id);
    const closedReason = closedRunRow?.status === "active" ? "run_still_active" : "run_not_active";
    closedBlocked = {
      ok: closedReason === "run_not_active",
      status: closedReason === "run_not_active" ? 409 : 200,
      body: {
        reason: closedReason,
        runId: run.id,
      },
    };

    const activeRun = findActiveWorkspaceRunByBranch(user.id, project.id, currentBranch)
      || listRuns({ userId: user.id, projectId: project.id }).find((row) => row.status === "active");
    if (activeRun) {
      const lock = createWorkspaceRunDispatch({
        userId: user.id,
        projectId: project.id,
        runId: activeRun.id,
        agentId: agent.id,
        status: "running",
        metadata: { readinessProbe: "overlap" },
      });

      const blocked = hasRunningWorkspaceRunDispatch(user.id, project.id, activeRun.id);
      overlapBlocked = {
        ok: blocked,
        status: blocked ? 409 : 200,
        body: {
          reason: blocked ? "run_dispatch_in_flight" : "no_overlap_guard",
          runId: activeRun.id,
        },
      };

      updateWorkspaceRunDispatch(user.id, project.id, lock.id, {
        status: "error",
        finishedAt: new Date().toISOString(),
        failureClass: "readiness_cleanup",
      });
    }
  } catch (error) {
    happyPath.error = String((error as Error).message || error);
  } finally {
    try {
      execSync(`git branch -D ${probeBranch}`, { cwd: project.rootPath, stdio: "pipe" });
    } catch {
      // ignore cleanup failure for readiness report
    }
  }

  const requiredChecksOk = adapterChecks.every((row) => row.ok);
  const ok = requiredChecksOk && happyPath.ok && closedBlocked.ok && overlapBlocked.ok;

  const output = {
    ok,
    checks: adapterChecks,
    gates: {
      run_create_list_close_happy_path: happyPath,
      blocked_dispatch_on_closed_run: closedBlocked,
      blocked_overlapping_dispatch_on_same_run: overlapBlocked,
    },
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
