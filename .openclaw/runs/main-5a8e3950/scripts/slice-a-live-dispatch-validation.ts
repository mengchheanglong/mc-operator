import { findOrCreateUser } from "../src/server/repositories/users-repo";
import { resolveProjectById } from "../src/server/context/project-context";
import { listAgents, createAgent } from "../src/server/repositories/agents-repo";
import { createRun, listRuns } from "../src/server/services/workspace-run-service";
import { execSync } from "child_process";

async function main() {
  const user = findOrCreateUser();
  const project = resolveProjectById("mission-control");

  let agent = listAgents(user.id, project.id).find(
    (row) => row.backend === "agent-orchestrator" && row.status === "active",
  );

  if (!agent) {
    agent = createAgent(user.id, project.id, {
      name: "AO Live Validation Agent",
      role: "builder",
      executor: "openclaw",
      backend: "agent-orchestrator",
      status: "active",
      systemPrompt: "Validate run targeted dispatch with bounded output.",
      topics: ["agents", "validation"],
      area: "automation",
    });
  }

  const existingRun = listRuns({ userId: user.id, projectId: project.id }).find((row) => row.status === "active");
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: project.rootPath }).toString().trim();
  const workspaceRun = existingRun
    ?? await createRun({
      userId: user.id,
      project,
      branch,
      metadata: { purpose: "slice-a-live-dispatch-validation" },
    });

  const payload = {
    task: "Validation ping: acknowledge run-scoped dispatch and respond with one-line confirmation only.",
    runId: workspaceRun.id,
    deepMode: false,
  };

  const response = await fetch(
    `http://localhost:3000/api/agents/${agent.id}/dispatch?projectId=${encodeURIComponent(project.id)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  const json = await response.json();

  console.log(
    JSON.stringify(
      {
        agentId: agent.id,
        runId: workspaceRun.id,
        runStatus: workspaceRun.status,
        requestPayload: payload,
        httpStatus: response.status,
        ok: response.ok,
        response: json,
      },
      null,
      2,
    ),
  );
}

main();
