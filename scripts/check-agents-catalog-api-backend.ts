import assert from "node:assert/strict";
import { withBackendTestEnv } from "./backend-test-helper.ts";

withBackendTestEnv(
  { port: 3218, tempPrefix: "mission-control-agents-catalog-api-", sqliteFilename: "agents-catalog-api.sqlite" },
  async () => {
    const agentsRoute = await import("../src/app/api/agents/route.ts");
    const agentByIdRoute = await import("../src/app/api/agents/[id]/route.ts");

    const listBeforeResponse = await agentsRoute.GET(
      new Request("http://localhost/api/agents?projectId=mission-control", { method: "GET" }),
    );
    assert.equal(listBeforeResponse.status, 200, "expected list agents to return 200");
    const listBeforeJson = (await listBeforeResponse.json()) as { agents?: Array<{ id?: string }> };
    assert.equal(Array.isArray(listBeforeJson.agents), true, "expected agents array from list endpoint");

    const createResponse = await agentsRoute.POST(
      new Request("http://localhost/api/agents?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Backend Catalog Agent",
          role: "builder",
          backend: "openclaw",
          executor: "openclaw",
          topics: ["agents", "backend"],
          workflowProfile: { mode: "execution", objectives: ["catalog"], constraints: [], deliverables: [] },
        }),
      }),
    );
    assert.equal(createResponse.status, 200, "expected create agent to return 200");
    const createJson = (await createResponse.json()) as { agent?: { id?: string; name?: string; topics?: string[] } };
    const createdAgentId = String(createJson.agent?.id || "");
    assert.ok(createdAgentId, "expected created agent id");
    assert.equal(createJson.agent?.name, "Backend Catalog Agent", "expected created agent name");
    assert.deepEqual(createJson.agent?.topics || [], ["agents", "backend"], "expected normalized topics");

    const blockedAoResponse = await agentsRoute.POST(
      new Request("http://localhost/api/agents?projectId=mission-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Blocked AO Agent",
          role: "builder",
          backend: "agent-orchestrator",
          executor: "openclaw",
          topics: ["agents", "backend"],
        }),
      }),
    );
    assert.equal(blockedAoResponse.status, 409, "expected AO create to be blocked while follow-up only");
    const blockedAoJson = (await blockedAoResponse.json()) as { reason?: string };
    assert.equal(blockedAoJson.reason, "backend_follow_up_only", "expected AO create block reason");

    const updateResponse = await agentByIdRoute.PUT(
      new Request(`http://localhost/api/agents/${createdAgentId}?projectId=mission-control`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "paused",
          area: "automation",
          profileId: "impeccable-ui",
        }),
      }),
      { params: Promise.resolve({ id: createdAgentId }) },
    );
    assert.equal(updateResponse.status, 200, "expected update agent to return 200");
    const updateJson = (await updateResponse.json()) as {
      agent?: { id?: string; status?: string; area?: string | null; profileId?: string };
    };
    assert.equal(updateJson.agent?.id, createdAgentId, "expected updated agent id");
    assert.equal(updateJson.agent?.status, "paused", "expected updated agent status");
    assert.equal(updateJson.agent?.area, "automation", "expected updated area");
    assert.equal(updateJson.agent?.profileId, "impeccable-ui", "expected updated profile id");

    const listAfterUpdateResponse = await agentsRoute.GET(
      new Request("http://localhost/api/agents?projectId=mission-control", { method: "GET" }),
    );
    assert.equal(listAfterUpdateResponse.status, 200, "expected list after update to return 200");
    const listAfterUpdateJson = (await listAfterUpdateResponse.json()) as {
      agents?: Array<{ id?: string; status?: string }>;
    };
    const listedAgent = (listAfterUpdateJson.agents || []).find((row) => row.id === createdAgentId);
    assert.equal(listedAgent?.status, "paused", "expected list endpoint to include updated status");

    const deleteResponse = await agentByIdRoute.DELETE(
      new Request(`http://localhost/api/agents/${createdAgentId}?projectId=mission-control`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: createdAgentId }) },
    );
    assert.equal(deleteResponse.status, 200, "expected delete agent to return 200");

    const listAfterDeleteResponse = await agentsRoute.GET(
      new Request("http://localhost/api/agents?projectId=mission-control", { method: "GET" }),
    );
    assert.equal(listAfterDeleteResponse.status, 200, "expected list after delete to return 200");
    const listAfterDeleteJson = (await listAfterDeleteResponse.json()) as { agents?: Array<{ id?: string }> };
    const stillPresent = (listAfterDeleteJson.agents || []).some((row) => row.id === createdAgentId);
    assert.equal(stillPresent, false, "expected deleted agent to be removed from list");

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          listBeforeCount: (listBeforeJson.agents || []).length,
          createdAgentId,
          blockedAoStatus: blockedAoResponse.status,
          listAfterDeleteCount: (listAfterDeleteJson.agents || []).length,
        },
        null,
        2,
      )}\n`,
    );
  },
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
