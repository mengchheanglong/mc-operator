import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "@/server/sqlite/schema";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";

// ---------------------------------------------------------------------------
// Resolve DB path and ensure parent directory exists
// ---------------------------------------------------------------------------

const dbPath = path.resolve(
  process.env.SQLITE_PATH || path.join(process.cwd(), "data", "openclaw.db"),
);

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Open SQLite connection with required pragmas
// ---------------------------------------------------------------------------

const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");

function ensureColumn(tableName: string, columnName: string, columnSql: string) {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  if (rows.some((row) => row.name === columnName)) {
    return;
  }

  sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
}

function ensureIndex(indexName: string, sqlStatement: string) {
  const existing = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
    )
    .get(indexName);

  if (!existing) {
    sqlite.exec(sqlStatement);
  }
}

function ensureTable(tableName: string, sqlStatement: string) {
  const existing = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(tableName);

  if (!existing) {
    sqlite.exec(sqlStatement);
  }
}

function ensureProjectScopedTables() {
  const defaultProjectId = getControlPlaneProjectId();
  const escapedDefaultProjectId = defaultProjectId.replace(/'/g, "''");

  ensureColumn(
    "quests",
    "project_id",
    `project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}'`,
  );
  ensureColumn(
    "quests",
    "topics_json",
    "topics_json text NOT NULL DEFAULT '[]'",
  );
  ensureColumn(
    "quests",
    "status",
    "status text NOT NULL DEFAULT 'open'",
  );
  ensureColumn(
    "quests",
    "area",
    "area text",
  );
  ensureColumn(
    "notes",
    "project_id",
    `project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}'`,
  );
  ensureColumn(
    "reports",
    "project_id",
    `project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}'`,
  );
  ensureColumn(
    "reports",
    "area",
    "area text",
  );
  ensureColumn(
    "reports",
    "linked_quest_id",
    "linked_quest_id text",
  );

  ensureIndex(
    "quests_user_project_status_date",
    "CREATE INDEX quests_user_project_status_date ON quests (user_id, project_id, status, completed, date)",
  );
  ensureIndex(
    "notes_user_project_status_updated",
    "CREATE INDEX notes_user_project_status_updated ON notes (user_id, project_id, completed, updated_at)",
  );
  ensureIndex(
    "reports_user_project_date",
    "CREATE INDEX reports_user_project_date ON reports (user_id, project_id, date)",
  );
  ensureIndex(
    "reports_user_project_area_date",
    "CREATE INDEX reports_user_project_area_date ON reports (user_id, project_id, area, date)",
  );
  ensureIndex(
    "reports_user_project_linked_quest",
    "CREATE INDEX reports_user_project_linked_quest ON reports (user_id, project_id, linked_quest_id)",
  );
  ensureTable(
    "saved_views",
    `
      CREATE TABLE saved_views (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
        surface text NOT NULL,
        name text NOT NULL,
        filters_json text NOT NULL DEFAULT '{}',
        created_at text NOT NULL,
        updated_at text NOT NULL
      )
    `,
  );
  ensureIndex(
    "saved_views_user_project_surface_updated",
    "CREATE INDEX saved_views_user_project_surface_updated ON saved_views (user_id, project_id, surface, updated_at)",
  );
  ensureTable(
    "automation_template_runs",
    `CREATE TABLE automation_template_runs (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      template_id text NOT NULL,
      mode text NOT NULL DEFAULT 'execute',
      status text NOT NULL DEFAULT 'queued',
      summary text,
      idempotency_key text,
      target_url text,
      request_json text NOT NULL DEFAULT '{}',
      response_json text NOT NULL DEFAULT '{}',
      error_message text,
      created_at text NOT NULL,
      updated_at text NOT NULL,
      completed_at text
    )`,
  );
  ensureIndex(
    "automation_template_runs_user_project_template_date",
    "CREATE INDEX automation_template_runs_user_project_template_date ON automation_template_runs (user_id, project_id, template_id, created_at)",
  );
  ensureIndex(
    "automation_template_runs_user_project_status_date",
    "CREATE INDEX automation_template_runs_user_project_status_date ON automation_template_runs (user_id, project_id, status, created_at)",
  );

  ensureTable(
    "automation_templates",
    `CREATE TABLE automation_templates (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      name text NOT NULL,
      prompt text NOT NULL,
      executor text NOT NULL DEFAULT 'codex',
      execution_env text NOT NULL DEFAULT 'worktree',
      webhook_path text,
      status text NOT NULL DEFAULT 'active',
      area text,
      topics_json text NOT NULL DEFAULT '[]',
      last_run_at text,
      last_run_status text,
      last_run_summary text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`,
  );
  ensureColumn(
    "automation_templates",
    "webhook_path",
    "webhook_path text",
  );

  ensureIndex(
    "automation_templates_user_project_updated",
    "CREATE INDEX automation_templates_user_project_updated ON automation_templates (user_id, project_id, updated_at)",
  );
  ensureIndex(
    "automation_templates_user_project_status",
    "CREATE INDEX automation_templates_user_project_status ON automation_templates (user_id, project_id, status, updated_at)",
  );

  ensureTable(
    "workspace_runs",
    `CREATE TABLE workspace_runs (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      branch text NOT NULL,
      worktree_path text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      metadata_json text NOT NULL DEFAULT '{}',
      created_at text NOT NULL,
      closed_at text
    )`,
  );
  ensureIndex(
    "workspace_runs_user_project_created",
    "CREATE INDEX workspace_runs_user_project_created ON workspace_runs (user_id, project_id, created_at)",
  );
  ensureIndex(
    "workspace_runs_user_project_branch_status",
    "CREATE INDEX workspace_runs_user_project_branch_status ON workspace_runs (user_id, project_id, branch, status)",
  );

  ensureTable(
    "workflow_run_guards",
    `CREATE TABLE workflow_run_guards (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      scope_type text NOT NULL,
      scope_id text NOT NULL,
      run_signature text NOT NULL,
      repeat_failure_count integer NOT NULL DEFAULT 0,
      duplicate_hit_count integer NOT NULL DEFAULT 0,
      reanalysis_required integer NOT NULL DEFAULT 0,
      last_cost_risk_tier text NOT NULL DEFAULT 'low',
      last_cost_risk_label text NOT NULL DEFAULT 'cost-risk/low',
      last_seen_at text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`,
  );
  ensureColumn("workflow_run_guards", "repeat_failure_count", "repeat_failure_count integer NOT NULL DEFAULT 0");
  ensureColumn("workflow_run_guards", "duplicate_hit_count", "duplicate_hit_count integer NOT NULL DEFAULT 0");
  ensureColumn("workflow_run_guards", "reanalysis_required", "reanalysis_required integer NOT NULL DEFAULT 0");
  ensureColumn("workflow_run_guards", "last_cost_risk_tier", "last_cost_risk_tier text NOT NULL DEFAULT 'low'");
  ensureColumn("workflow_run_guards", "last_cost_risk_label", "last_cost_risk_label text NOT NULL DEFAULT 'cost-risk/low'");
  ensureColumn("workflow_run_guards", "last_seen_at", "last_seen_at text NOT NULL DEFAULT ''");
  ensureIndex(
    "workflow_run_guards_user_project_scope",
    "CREATE INDEX workflow_run_guards_user_project_scope ON workflow_run_guards (user_id, project_id, scope_type, scope_id)",
  );

  ensureTable(
    "agents",
    `CREATE TABLE agents (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      name text NOT NULL,
      role text NOT NULL DEFAULT 'builder',
      description text,
      executor text NOT NULL DEFAULT 'openclaw',
      status text NOT NULL DEFAULT 'active',
      area text,
      topics_json text NOT NULL DEFAULT '[]',
      system_prompt text NOT NULL DEFAULT '',
      model text,
      backend text NOT NULL DEFAULT 'openclaw',
      session_id text,
      source_pack text NOT NULL DEFAULT 'native',
      source_ref text,
      workflow_json text NOT NULL DEFAULT '{}',
      pack_assets_json text NOT NULL DEFAULT '[]',
      handoff_agent_ids_json text NOT NULL DEFAULT '[]',
      chain_policy text NOT NULL DEFAULT 'manual',
      last_run_at text,
      last_run_status text,
      last_run_summary text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`,
  );
  ensureColumn("agents", "description", "description text");
  ensureColumn("agents", "executor", "executor text NOT NULL DEFAULT 'openclaw'");
  ensureColumn("agents", "status", "status text NOT NULL DEFAULT 'active'");
  ensureColumn("agents", "area", "area text");
  ensureColumn("agents", "topics_json", "topics_json text NOT NULL DEFAULT '[]'");
  ensureColumn("agents", "system_prompt", "system_prompt text NOT NULL DEFAULT ''");
  ensureColumn("agents", "model", "model text");
  ensureColumn("agents", "backend", "backend text NOT NULL DEFAULT 'openclaw'");
  ensureColumn("agents", "session_id", "session_id text");
  ensureColumn("agents", "source_pack", "source_pack text NOT NULL DEFAULT 'native'");
  ensureColumn("agents", "source_ref", "source_ref text");
  ensureColumn("agents", "workflow_json", "workflow_json text NOT NULL DEFAULT '{}'");
  ensureColumn("agents", "pack_assets_json", "pack_assets_json text NOT NULL DEFAULT '[]'");
  ensureColumn("agents", "handoff_agent_ids_json", "handoff_agent_ids_json text NOT NULL DEFAULT '[]'");
  ensureColumn("agents", "chain_policy", "chain_policy text NOT NULL DEFAULT 'manual'");
  ensureColumn("agents", "last_run_at", "last_run_at text");
  ensureColumn("agents", "last_run_status", "last_run_status text");
  ensureColumn("agents", "last_run_summary", "last_run_summary text");

  ensureIndex(
    "agents_user_project_updated",
    "CREATE INDEX agents_user_project_updated ON agents (user_id, project_id, updated_at)",
  );
  ensureIndex(
    "agents_user_project_status",
    "CREATE INDEX agents_user_project_status ON agents (user_id, project_id, status, updated_at)",
  );

  sqlite.exec(`
    UPDATE quests
    SET status = 'done'
    WHERE completed = 1
      AND COALESCE(status, '') <> 'done'
  `);

  sqlite.exec(`
    UPDATE quests
    SET status = 'open'
    WHERE completed = 0
      AND COALESCE(status, '') NOT IN ('open', 'in_progress', 'blocked')
  `);
}

ensureProjectScopedTables();

// ---------------------------------------------------------------------------
// Drizzle client
// ---------------------------------------------------------------------------

export const db = drizzle(sqlite, { schema });
export { sqlite };
