import Database from "better-sqlite3";

const runId = process.argv[2];
if (!runId) throw new Error("runId required");

const db = new Database("data/openclaw.db");
const now = new Date().toISOString();
const row = db
  .prepare("select id from workspace_run_dispatches where run_id = ? and status = 'running' order by started_at desc limit 1")
  .get(runId) as { id: string } | undefined;
if (row?.id) {
  db.prepare("update workspace_run_dispatches set status = 'error', failure_class = ?, finished_at = ? where id = ?")
    .run("stale_running_recovery", now, row.id);
}
console.log(JSON.stringify({ updated: row?.id || null, now }));
