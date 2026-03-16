import { execSync } from "child_process";
import { findOrCreateUser } from "../src/server/repositories/users-repo";
import { resolveProjectById } from "../src/server/context/project-context";
import { listAgents } from "../src/server/repositories/agents-repo";
import { closeRun, createRun, listRuns } from "../src/server/services/workspace-run-service";
import { createWorkspaceRunDispatch, updateWorkspaceRunDispatch } from "../src/server/repositories/workspace-run-dispatches-repo";

function runCheck(command: string) {
  try {
    execSync(command, { stdio: "pipe", encoding: "utf8" });
    return { command, ok: true };
  } catch (error) {
    const message = String((error as Error & { stderr?: string }).message || "");
    return { command, ok: false, error: message.slice(0, 5000) };
  }
}

async function postJson(url: string, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { status: response.status, ok: response.ok, body: await response.json() as Record<string, unknown> };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const user = findOrCreateUser();
  const project = resolveProjectById("mission-control");
  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: project.rootPath, encoding: "utf8" }).trim();
  const probeBranch = `readiness-probe-${Date.now()}`;

  const adapterChecks = [
    "npm run check:agent-evals",
    "npm run check:agent-eval-regression",
    "npm run check:canary-health",
    "npm run check:adapters",
    "npm run check:ui-smoke",
  ].map(runCheck);

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

    const closedDispatch = await postJson(
      `http://localhost:3000/api/agents/${agent.id}/dispatch?projectId=${encodeURIComponent(project.id)}`,
      {
        task: `readiness closed run probe ${Date.now()}`,
        runId: run.id,
        deepMode: false,
      },
    );

    const closedReason = String(closedDispatch.body.reason || closedDispatch.body.code || "");
    closedBlocked = {
      ok: closedDispatch.status === 409 && (closedReason === "run_not_active" || closedReason === "duplicate_run_guard"),
      status: closedDispatch.status,
      body: closedDispatch.body,
    };

    const activeRun = listRuns({ userId: user.id, projectId: project.id }).find((row) => row.status === "active");
    if (activeRun) {
      const lock = createWorkspaceRunDispatch({
        userId: user.id,
        projectId: project.id,
        runId: activeRun.id,
        agentId: agent.id,
        status: "running",
        metadata: { readinessProbe: "overlap" },
      });

      const overlapDispatch = await postJson(
        `http://localhost:3000/api/agents/${agent.id}/dispatch?projectId=${encodeURIComponent(project.id)}`,
        {
          task: "readiness overlap probe",
          runId: activeRun.id,
          deepMode: false,
        },
      );

      overlapBlocked = {
        ok: overlapDispatch.status === 409 && String(overlapDispatch.body.reason || "") === "run_dispatch_in_flight",
        status: overlapDispatch.status,
        body: overlapDispatch.body,
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
