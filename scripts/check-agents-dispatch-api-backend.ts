import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { withBackendTestEnv } from "./backend-test-helper.ts";

withBackendTestEnv(
  { port: 3217, tempPrefix: "mission-control-agents-dispatch-api-", sqliteFilename: "agents-dispatch-api.sqlite" },
  async ({ tempDir, sqlitePath }) => {
    const now = new Date().toISOString();
    const userId = randomUUID();
    const agentId = randomUUID();
    const closedRunId = randomUUID();
    const activeRunId = randomUUID();
    const activeDispatchId = randomUUID();
    const closedRunWorktree = path.join(tempDir, "run-closed");
    const activeRunWorktree = path.join(tempDir, "run-active");
    mkdirSync(closedRunWorktree, { recursive: true });
    mkdirSync(activeRunWorktree, { recursive: true });

    const db = new Database(sqlitePath);
    try {
      db.prepare(
        "INSERT INTO users (id, name, timezone, join_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(userId, "Dispatch Backend Check", "Asia/Bangkok", now, now, now);

      db.prepare(
        "INSERT INTO agents (id, user_id, project_id, name, role, description, executor, status, area, topics_json, system_prompt, model, backend, session_id, source_pack, source_ref, workflow_json, pack_assets_json, handoff_agent_ids_json, chain_policy, last_run_at, last_run_status, last_run_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        agentId,
        userId,
        "mission-control",
        "Dispatch Backend Agent",
        "builder",
        null,
        "openclaw",
        "active",
        "automation",
        "[]",
        "backend dispatch check",
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

      db.prepare(
        "INSERT INTO workspace_runs (id, user_id, project_id, branch, worktree_path, status, metadata_json, created_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        closedRunId,
        userId,
        "mission-control",
        "main",
        closedRunWorktree,
        "closed",
        "{}",
        now,
        now,
      );

      db.prepare(
        "INSERT INTO workspace_runs (id, user_id, project_id, branch, worktree_path, status, metadata_json, created_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        activeRunId,
        userId,
        "mission-control",
        "main",
        activeRunWorktree,
        "active",
        "{}",
        now,
        null,
      );

      db.prepare(
        "INSERT INTO workspace_run_dispatches (id, user_id, project_id, run_id, agent_id, session_id, model, started_at, finished_at, status, failure_class, command, report_id, artifact_path, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        activeDispatchId,
        userId,
        "mission-control",
        activeRunId,
        agentId,
        null,
        null,
        now,
        null,
        "running",
        null,
        null,
        null,
        activeRunWorktree,
        "{}",
      );
    } finally {
      db.close();
    }

    const dispatchRoute = await import("../src/app/api/agents/[id]/dispatch/route.ts");

    const missingTaskResponse = await dispatchRoute.POST(
      new Request(`http://localhost/api/agents/${agentId}/dispatch?projectId=mission-control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: agentId }) },
    );
    assert.equal(missingTaskResponse.status, 400, "expected missing task to return 400");
    const missingTaskJson = (await missingTaskResponse.json()) as { reason?: string };
    assert.equal(missingTaskJson.reason, "missing_task", "expected missing task reason");

    const closedRunResponse = await dispatchRoute.POST(
      new Request(`http://localhost/api/agents/${agentId}/dispatch?projectId=mission-control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "dispatch check", runId: closedRunId }),
      }),
      { params: Promise.resolve({ id: agentId }) },
    );
    assert.equal(closedRunResponse.status, 409, "expected closed run to return 409");
    const closedRunJson = (await closedRunResponse.json()) as { reason?: string };
    assert.equal(closedRunJson.reason, "run_not_active", "expected closed run reason");

    const overlapResponse = await dispatchRoute.POST(
      new Request(`http://localhost/api/agents/${agentId}/dispatch?projectId=mission-control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "dispatch check", runId: activeRunId }),
      }),
      { params: Promise.resolve({ id: agentId }) },
    );
    assert.equal(overlapResponse.status, 409, "expected overlap to return 409");
    const overlapJson = (await overlapResponse.json()) as { reason?: string };
    assert.equal(overlapJson.reason, "run_dispatch_in_flight", "expected overlap reason");

    const unknownAgentId = randomUUID();
    const unknownAgentResponse = await dispatchRoute.POST(
      new Request(`http://localhost/api/agents/${unknownAgentId}/dispatch?projectId=mission-control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "dispatch check" }),
      }),
      { params: Promise.resolve({ id: unknownAgentId }) },
    );
    assert.equal(unknownAgentResponse.status, 404, "expected unknown agent to return 404");
    const unknownAgentJson = (await unknownAgentResponse.json()) as { reason?: string };
    assert.equal(unknownAgentJson.reason, "agent_not_found", "expected unknown agent reason");

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          missingTask: { status: missingTaskResponse.status, reason: missingTaskJson.reason || null },
          closedRun: { status: closedRunResponse.status, reason: closedRunJson.reason || null },
          overlap: { status: overlapResponse.status, reason: overlapJson.reason || null },
          unknownAgent: { status: unknownAgentResponse.status, reason: unknownAgentJson.reason || null },
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
