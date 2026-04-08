import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { withBackendTestEnv } from "./backend-test-helper.ts";

withBackendTestEnv(
  { port: 3216, tempPrefix: "mission-control-agents-runtime-api-", sqliteFilename: "agents-runtime-api.sqlite" },
  async ({ sqlitePath }) => {
    const agentId = randomUUID();
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
        ).run(userId, "Agents Runtime Check", "Asia/Bangkok", now, now, now);
      }
      db.prepare(
        "INSERT INTO agents (id, user_id, project_id, name, role, description, executor, status, area, topics_json, system_prompt, model, backend, session_id, source_pack, source_ref, workflow_json, pack_assets_json, handoff_agent_ids_json, chain_policy, last_run_at, last_run_status, last_run_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        agentId,
        userId,
        "mission-control",
        "Backend AO Agent",
        "builder",
        null,
        "openclaw",
        "active",
        "automation",
        "[]",
        "backend check",
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
    } finally {
      db.close();
    }

    const statusRoute = await import("../src/app/api/agents/[id]/status/route.ts");
    const killRoute = await import("../src/app/api/agents/[id]/kill/route.ts");
    const restoreRoute = await import("../src/app/api/agents/[id]/restore/route.ts");

    const statusResponse = await statusRoute.GET(
      new Request(
        `http://localhost/api/agents/${agentId}/status?projectId=mission-control&includeSessions=1`,
        { method: "GET" },
      ),
      { params: Promise.resolve({ id: agentId }) },
    );
    assert.equal(statusResponse.status, 409, "expected status endpoint 409 while AO is follow-up only");
    const statusJson = (await statusResponse.json()) as {
      reason?: string;
      agent?: { id?: string; status?: string };
      status?: { ok?: boolean };
    };
    assert.equal(statusJson.reason, "backend_follow_up_only", "expected blocked AO runtime reason");

    const killResponse = await killRoute.POST(
      new Request(`http://localhost/api/agents/${agentId}/kill?projectId=mission-control`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: agentId }) },
    );
    assert.equal(killResponse.status, 409, "expected kill endpoint 409 while AO is follow-up only");
    const killJson = (await killResponse.json()) as { reason?: string };
    assert.equal(killJson.reason, "backend_follow_up_only", "expected kill block reason");

    const restoreResponse = await restoreRoute.POST(
      new Request(`http://localhost/api/agents/${agentId}/restore?projectId=mission-control`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: agentId }) },
    );
    assert.equal(
      restoreResponse.status,
      409,
      "expected restore to return 409 while AO is follow-up only",
    );
    const restoreJson = (await restoreResponse.json()) as { reason?: string };
    assert.equal(restoreJson.reason, "backend_follow_up_only", "expected restore block reason");

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          agentId,
          status: {
            routeStatus: statusResponse.status,
            reason: statusJson.reason || null,
          },
          kill: {
            routeStatus: killResponse.status,
            reason: killJson.reason || null,
          },
          restore: {
            routeStatus: restoreResponse.status,
            reason: restoreJson.reason || null,
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
