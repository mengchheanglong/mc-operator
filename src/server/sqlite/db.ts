import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "@/server/sqlite/schema";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";

// ---------------------------------------------------------------------------
// Resolve DB path and ensure parent directory exists
// ---------------------------------------------------------------------------

const configuredSqlitePath = String(process.env.SQLITE_PATH || "").trim();
const dbPath = configuredSqlitePath
  ? path.resolve(configuredSqlitePath)
  : path.join("data", "openclaw.db");

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

  ensureTable(
    "users",
    `CREATE TABLE users (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL DEFAULT 'Adventurer',
      timezone text NOT NULL DEFAULT 'Asia/Bangkok',
      join_date text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`,
  );
  ensureTable(
    "quests",
    `CREATE TABLE quests (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      goal text NOT NULL,
      difficulty text NOT NULL DEFAULT 'normal',
      completed integer NOT NULL DEFAULT 0,
      date text NOT NULL,
      completed_date text
    )`,
  );
  ensureTable(
    "notes",
    `CREATE TABLE notes (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      content text NOT NULL,
      completed integer NOT NULL DEFAULT 0,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`,
  );
  ensureTable(
    "reports",
    `CREATE TABLE reports (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      title text NOT NULL,
      content text NOT NULL,
      category text NOT NULL DEFAULT 'system',
      status text NOT NULL DEFAULT 'info',
      source text NOT NULL DEFAULT 'OpenClaw',
      metadata_json text NOT NULL DEFAULT '{}',
      date text NOT NULL
    )`,
  );

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
    "workspace_run_dispatches",
    `CREATE TABLE workspace_run_dispatches (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      run_id text NOT NULL REFERENCES workspace_runs(id),
      agent_id text NOT NULL,
      session_id text,
      model text,
      started_at text NOT NULL,
      finished_at text,
      status text NOT NULL DEFAULT 'running',
      failure_class text,
      command text,
      report_id text,
      artifact_path text,
      metadata_json text NOT NULL DEFAULT '{}'
    )`,
  );
  ensureIndex(
    "workspace_run_dispatches_user_project_run_started",
    "CREATE INDEX workspace_run_dispatches_user_project_run_started ON workspace_run_dispatches (user_id, project_id, run_id, started_at)",
  );
  ensureIndex(
    "workspace_run_dispatches_user_project_run_status",
    "CREATE INDEX workspace_run_dispatches_user_project_run_status ON workspace_run_dispatches (user_id, project_id, run_id, status)",
  );

  ensureTable(
    "directive_capabilities",
    `CREATE TABLE directive_capabilities (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      source_type text NOT NULL DEFAULT 'github-repo',
      source_ref text NOT NULL,
      title text NOT NULL,
      status text NOT NULL DEFAULT 'intake',
      framework_status text NOT NULL DEFAULT 'intake',
      runtime_status text NOT NULL DEFAULT 'none',
      workflow_family text NOT NULL,
      user_intent text,
      notes_json text NOT NULL DEFAULT '[]',
      analysis_summary text,
      category text,
      problem_fit text,
      overlap_notes text,
      risk_notes text,
      recommendation text,
      metadata_json text NOT NULL DEFAULT '{}',
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`,
  );
  ensureIndex(
    "directive_capabilities_user_project_created",
    "CREATE INDEX directive_capabilities_user_project_created ON directive_capabilities (user_id, project_id, created_at)",
  );
  ensureIndex(
    "directive_capabilities_user_project_status_updated",
    "CREATE INDEX directive_capabilities_user_project_status_updated ON directive_capabilities (user_id, project_id, status, updated_at)",
  );
  ensureIndex(
    "directive_capabilities_user_project_source_ref",
    "CREATE INDEX directive_capabilities_user_project_source_ref ON directive_capabilities (user_id, project_id, source_ref)",
  );
  ensureColumn(
    "directive_capabilities",
    "framework_status",
    "framework_status text NOT NULL DEFAULT 'intake'",
  );
  ensureColumn(
    "directive_capabilities",
    "runtime_status",
    "runtime_status text NOT NULL DEFAULT 'none'",
  );

  ensureTable(
    "directive_experiments",
    `CREATE TABLE directive_experiments (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      capability_id text NOT NULL REFERENCES directive_capabilities(id),
      run_id text REFERENCES workspace_runs(id),
      hypothesis text NOT NULL,
      plan text NOT NULL,
      success_criteria_json text NOT NULL DEFAULT '[]',
      status text NOT NULL DEFAULT 'proposed',
      artifact_path text,
      metadata_json text NOT NULL DEFAULT '{}',
      created_at text NOT NULL,
      updated_at text NOT NULL,
      completed_at text
    )`,
  );
  ensureIndex(
    "directive_experiments_user_project_capability_created",
    "CREATE INDEX directive_experiments_user_project_capability_created ON directive_experiments (user_id, project_id, capability_id, created_at)",
  );
  ensureIndex(
    "directive_experiments_user_project_status_updated",
    "CREATE INDEX directive_experiments_user_project_status_updated ON directive_experiments (user_id, project_id, status, updated_at)",
  );

  ensureTable(
    "directive_evaluations",
    `CREATE TABLE directive_evaluations (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      capability_id text NOT NULL REFERENCES directive_capabilities(id),
      experiment_id text NOT NULL REFERENCES directive_experiments(id),
      outcome text NOT NULL DEFAULT 'inconclusive',
      usefulness text,
      friction text,
      workflow_impact text,
      evidence_summary text NOT NULL,
      metadata_json text NOT NULL DEFAULT '{}',
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`,
  );
  ensureIndex(
    "directive_evaluations_user_project_capability_created",
    "CREATE INDEX directive_evaluations_user_project_capability_created ON directive_evaluations (user_id, project_id, capability_id, created_at)",
  );
  ensureIndex(
    "directive_evaluations_user_project_experiment",
    "CREATE INDEX directive_evaluations_user_project_experiment ON directive_evaluations (user_id, project_id, experiment_id, created_at)",
  );

  ensureTable(
    "directive_decisions",
    `CREATE TABLE directive_decisions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      capability_id text NOT NULL REFERENCES directive_capabilities(id),
      evaluation_id text REFERENCES directive_evaluations(id),
      decision text NOT NULL,
      rationale text NOT NULL,
      decided_by text NOT NULL DEFAULT 'user',
      metadata_json text NOT NULL DEFAULT '{}',
      created_at text NOT NULL
    )`,
  );
  ensureIndex(
    "directive_decisions_user_project_capability_created",
    "CREATE INDEX directive_decisions_user_project_capability_created ON directive_decisions (user_id, project_id, capability_id, created_at)",
  );

  ensureTable(
    "directive_integrations",
    `CREATE TABLE directive_integrations (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      capability_id text NOT NULL REFERENCES directive_capabilities(id),
      decision_id text NOT NULL REFERENCES directive_decisions(id),
      status text NOT NULL DEFAULT 'planned',
      integration_mode text NOT NULL DEFAULT 'adapt',
      integration_surface text NOT NULL,
      target_runtime_surface text,
      owner text,
      due_at text,
      required_gates_json text NOT NULL DEFAULT '[]',
      proof_artifact_path text,
      rollback_plan text,
      dependency_notes text,
      rollback_notes text,
      metadata_json text NOT NULL DEFAULT '{}',
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`,
  );
  ensureIndex(
    "directive_integrations_user_project_capability_created",
    "CREATE INDEX directive_integrations_user_project_capability_created ON directive_integrations (user_id, project_id, capability_id, created_at)",
  );
  ensureIndex(
    "directive_integrations_user_project_status_updated",
    "CREATE INDEX directive_integrations_user_project_status_updated ON directive_integrations (user_id, project_id, status, updated_at)",
  );
  ensureColumn(
    "directive_integrations",
    "integration_mode",
    "integration_mode text NOT NULL DEFAULT 'adapt'",
  );
  ensureColumn(
    "directive_integrations",
    "target_runtime_surface",
    "target_runtime_surface text",
  );
  ensureColumn("directive_integrations", "owner", "owner text");
  ensureColumn("directive_integrations", "due_at", "due_at text");
  ensureColumn(
    "directive_integrations",
    "required_gates_json",
    "required_gates_json text NOT NULL DEFAULT '[]'",
  );
  ensureColumn(
    "directive_integrations",
    "proof_artifact_path",
    "proof_artifact_path text",
  );
  ensureColumn(
    "directive_integrations",
    "rollback_plan",
    "rollback_plan text",
  );

  sqlite.exec(`
    UPDATE directive_capabilities
    SET framework_status = CASE
      WHEN status IN ('intake','analyzed','experimenting','evaluated','decided') THEN status
      WHEN status = 'integrated' THEN 'decided'
      ELSE 'intake'
    END
    WHERE COALESCE(framework_status, '') = ''
       OR framework_status NOT IN ('intake','analyzed','experimenting','evaluated','decided')
  `);
  sqlite.exec(`
    UPDATE directive_capabilities
    SET runtime_status = CASE
      WHEN status = 'integrated' THEN 'callable'
      WHEN status = 'decided' THEN 'none'
      ELSE COALESCE(runtime_status, 'none')
    END
    WHERE COALESCE(runtime_status, '') = ''
       OR (status = 'integrated' AND runtime_status = 'none')
  `);
  sqlite.exec(`
    UPDATE directive_integrations
    SET integration_mode = COALESCE(NULLIF(integration_mode, ''), 'adapt'),
        target_runtime_surface = COALESCE(NULLIF(target_runtime_surface, ''), integration_surface),
        owner = COALESCE(NULLIF(owner, ''), 'operator'),
        due_at = COALESCE(NULLIF(due_at, ''), datetime(created_at, '+24 hours')),
        required_gates_json = CASE
          WHEN required_gates_json IS NULL OR required_gates_json = '' OR required_gates_json = '[]'
            THEN '["npm run check:directive-v0","npm run check:directive-integration-proof","npm run check:ops-stack"]'
          ELSE required_gates_json
        END,
        rollback_plan = COALESCE(NULLIF(rollback_plan, ''), rollback_notes, 'Set integration status to parked and remove callable wiring.')
  `);

  ensureTable(
    "orchestrator_reliability_stats",
    `CREATE TABLE orchestrator_reliability_stats (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id),
      project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}',
      create_total integer NOT NULL DEFAULT 0,
      create_success integer NOT NULL DEFAULT 0,
      dispatch_total integer NOT NULL DEFAULT 0,
      dispatch_success integer NOT NULL DEFAULT 0,
      close_total integer NOT NULL DEFAULT 0,
      close_success integer NOT NULL DEFAULT 0,
      overlap_block_count integer NOT NULL DEFAULT 0,
      stale_cleanup_count integer NOT NULL DEFAULT 0,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`,
  );
  ensureIndex(
    "orchestrator_reliability_user_project",
    "CREATE INDEX orchestrator_reliability_user_project ON orchestrator_reliability_stats (user_id, project_id)",
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
