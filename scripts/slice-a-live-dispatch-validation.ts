import { findOrCreateUser } from "../src/server/repositories/users-repo";
import { resolveProjectById } from "../src/server/context/project-context";
import { listAgents, createAgent } from "../src/server/repositories/agents-repo";
import { createRun, closeRun, listRuns } from "../src/server/services/workspace-run-service";
import { execSync } from "child_process";

const BASE_URL = process.env.SLICE_A_BASE_URL
  ?? process.env.MISSION_CONTROL_BASE_URL
  ?? "http://localhost:3000";

async function assertMissionControlReachable() {
  const probeUrl = new URL("/api/projects", BASE_URL);
  try {
    const probe = await fetch(probeUrl, { signal: AbortSignal.timeout(8_000) });
    if (!probe.ok) {
      throw new Error(`Probe returned HTTP ${probe.status}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Mission Control API is not reachable at ${BASE_URL}.`,
        `Reason: ${detail}`,
        "Start the app first in another terminal:",
        "  cd C:\\Users\\User\\.openclaw\\workspace\\mission-control",
        "  npm run dev",
        "Or set SLICE_A_BASE_URL if using a different host/port.",
      ].join("\n"),
    );
  }
}

async function main() {
  await assertMissionControlReachable();

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

  const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: project.rootPath }).toString().trim();
  const existingRun = listRuns({ userId: user.id, projectId: project.id }).find((row) => row.status === "active");
  if (existingRun) {
    await closeRun({
      userId: user.id,
      project,
      runId: existingRun.id,
      archive: false,
      reason: "manual",
    });
  }
  const workspaceRun = await createRun({
    userId: user.id,
    project,
    branch,
    metadata: { purpose: "slice-a-live-dispatch-validation" },
  });

  const payload = {
    task: `Validation ping ${new Date().toISOString()}: acknowledge run-scoped dispatch and respond with one-line confirmation only.`,
    runId: workspaceRun.id,
    deepMode: false,
  };

  const dispatchUrl = new URL(`/api/agents/${agent.id}/dispatch`, BASE_URL);
  dispatchUrl.searchParams.set("projectId", project.id);

  const response = await fetch(dispatchUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });

  const json = await response.json();

  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
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
