import Database from "better-sqlite3";
import path from "path";

const runId = process.argv[2];
if (!runId) {
  throw new Error("runId arg required");
}

const db = new Database(path.resolve("data/openclaw.db"), { readonly: true });

const run = db
  .prepare("select id, branch, worktree_path, status, created_at, closed_at, metadata_json from workspace_runs where id = ?")
  .get(runId);

const reports = db
  .prepare("select id, date, title, status, metadata_json from reports where metadata_json like ? order by date desc limit 5")
  .all(`%${runId}%`);

console.log(JSON.stringify({ run, reports }, null, 2));
