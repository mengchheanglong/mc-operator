import { findOrCreateUser } from "../src/server/repositories/users-repo";
import { resolveProjectById } from "../src/server/context/project-context";
import { listAgents } from "../src/server/repositories/agents-repo";
import { listRuns } from "../src/server/services/workspace-run-service";

async function main() {
  const user = findOrCreateUser();
  const project = resolveProjectById("mission-control");
  const agent = listAgents(user.id, project.id).find((a) => a.backend === "agent-orchestrator" && a.status === "active");
  const run = listRuns({ userId: user.id, projectId: project.id }).find((r) => r.status === "active");

  if (!agent || !run) {
    console.log(JSON.stringify({ ok: false, reason: "missing_agent_or_run", agent: !!agent, run: !!run }, null, 2));
    return;
  }

  const base = `http://localhost:3000`;
  const payload = {
    task: `Slice B acceptance ${new Date().toISOString()}: respond with one-line confirmation only.`,
    runId: run.id,
    deepMode: false,
  };

  const first = await fetch(`${base}/api/agents/${agent.id}/dispatch?projectId=${encodeURIComponent(project.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const firstJson = await first.json();

  const second = await fetch(`${base}/api/agents/${agent.id}/dispatch?projectId=${encodeURIComponent(project.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, task: `${payload.task} overlap-check` }),
  });
  const secondJson = await second.json();

  const summaryRes = await fetch(`${base}/api/automation/runs/${run.id}/summary?projectId=${encodeURIComponent(project.id)}`);
  const summaryJson = await summaryRes.json();

  const closeRes = await fetch(`${base}/api/automation/runs/${run.id}/close?projectId=${encodeURIComponent(project.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ archive: false, reason: "manual" }),
  });
  const closeJson = await closeRes.json();

  const closedDispatchRes = await fetch(`${base}/api/agents/${agent.id}/dispatch?projectId=${encodeURIComponent(project.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, task: `${payload.task} closed-check` }),
  });
  const closedDispatchJson = await closedDispatchRes.json();

  console.log(JSON.stringify({
    ok: true,
    runId: run.id,
    agentId: agent.id,
    first: { status: first.status, ok: first.ok, body: firstJson },
    second: { status: second.status, ok: second.ok, body: secondJson },
    summary: { status: summaryRes.status, ok: summaryRes.ok, body: summaryJson },
    close: { status: closeRes.status, ok: closeRes.ok, body: closeJson },
    closedDispatch: { status: closedDispatchRes.status, ok: closedDispatchRes.ok, body: closedDispatchJson },
  }, null, 2));
}

main();
