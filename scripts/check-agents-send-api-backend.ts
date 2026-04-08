import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { withBackendTestEnv } from "./backend-test-helper.ts";

withBackendTestEnv(
  { port: 3221, tempPrefix: "mission-control-agents-send-api-", sqliteFilename: "agents-send-api.sqlite" },
  async ({ sqlitePath }) => {
    const openclawAgentId = randomUUID();
    const aoNoSessionAgentId = randomUUID();
    const aoWithSessionAgentId = randomUUID();
    const now = new Date().toISOString();
    const db = new Database(sqlitePath);
    try {
      const existingUser = db
        .prepare("SELECT id FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1")
        .get() as { id?: string } | undefined;
      const userId = String(existingUser?.id || randomUUID());
      if (!existingUser?.id) {
        db.prepare(
          "INSERT INTO users (id, name, timezone, join_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(userId, "Agents Send Check", "Asia/Bangkok", now, now, now);
      }
      const insertAgent = db.prepare(
        "INSERT INTO agents (id, user_id, project_id, name, role, description, executor, status, area, topics_json, system_prompt, model, backend, session_id, source_pack, source_ref, workflow_json, pack_assets_json, handoff_agent_ids_json, chain_policy, last_run_at, last_run_status, last_run_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      insertAgent.run(
        openclawAgentId,
        userId,
        "mission-control",
        "OpenClaw Agent",
        "builder",
        null,
        "openclaw",
        "active",
        "automation",
        "[]",
        "send check",
        null,
        "openclaw",
        null,
        "native",
        null,
        "{}",
        "[]",
        "[]",
        "manual",
        null,
        null,
        null,
        now,
        now,
      );
      insertAgent.run(
        aoNoSessionAgentId,
        userId,
        "mission-control",
        "AO No Session Agent",
        "builder",
        null,
        "openclaw",
        "active",
        "automation",
        "[]",
        "send check",
        null,
        "agent-orchestrator",
        null,
        "native",
        null,
        "{}",
        "[]",
        "[]",
        "manual",
        null,
        null,
        null,
        now,
        now,
      );
      insertAgent.run(
        aoWithSessionAgentId,
        userId,
        "mission-control",
        "AO Session Agent",
        "builder",
        null,
        "openclaw",
        "active",
        "automation",
        "[]",
        "send check",
        null,
        "agent-orchestrator",
        "test-session-123",
        "native",
        null,
        "{}",
        "[]",
        "[]",
        "manual",
        null,
        null,
        null,
        now,
        now,
      );
    } finally {
      db.close();
    }

    const route = await import("../src/app/api/agents/[id]/send/route.ts");
    const missingMessageResponse = await route.POST(
      new Request(`http://localhost/api/agents/${aoWithSessionAgentId}/send?projectId=mission-control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: aoWithSessionAgentId }) },
    );
    assert.equal(missingMessageResponse.status, 409, "expected AO send to be blocked while follow-up only");
    const missingMessageJson = (await missingMessageResponse.json()) as { reason?: string };
    assert.equal(missingMessageJson.reason, "backend_follow_up_only", "expected AO send block reason");

    const unsupportedResponse = await route.POST(
      new Request(`http://localhost/api/agents/${openclawAgentId}/send?projectId=mission-control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      }),
      { params: Promise.resolve({ id: openclawAgentId }) },
    );
    assert.equal(unsupportedResponse.status, 400, "expected unsupported backend to return 400");
    const unsupportedJson = (await unsupportedResponse.json()) as { reason?: string };
    assert.equal(unsupportedJson.reason, "unsupported_backend", "expected unsupported backend reason");

    const noSessionResponse = await route.POST(
      new Request(`http://localhost/api/agents/${aoNoSessionAgentId}/send?projectId=mission-control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      }),
      { params: Promise.resolve({ id: aoNoSessionAgentId }) },
    );
    assert.equal(noSessionResponse.status, 409, "expected AO send to be blocked before session validation");
    const noSessionJson = (await noSessionResponse.json()) as { reason?: string };
    assert.equal(noSessionJson.reason, "backend_follow_up_only", "expected AO follow-up-only reason");

    const unknownAgentId = randomUUID();
    const unknownResponse = await route.POST(
      new Request(`http://localhost/api/agents/${unknownAgentId}/send?projectId=mission-control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      }),
      { params: Promise.resolve({ id: unknownAgentId }) },
    );
    assert.equal(unknownResponse.status, 404, "expected unknown agent to return 404");
    const unknownJson = (await unknownResponse.json()) as { reason?: string };
    assert.equal(unknownJson.reason, "agent_not_found", "expected unknown agent reason");

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          checks: {
            missingMessage: missingMessageResponse.status,
            unsupportedBackend: unsupportedResponse.status,
            missingSession: noSessionResponse.status,
            unknownAgent: unknownResponse.status,
          },
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
