import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Database from "better-sqlite3";
import path from "node:path";

@Injectable()
export class SqliteService implements OnModuleDestroy {
  private readonly defaultProjectId =
    process.env.MISSION_CONTROL_DEFAULT_PROJECT_ID || "mc-operator";

  private readonly dbPath =
    process.env.SQLITE_PATH ||
    path.resolve(process.cwd(), "..", "data", "openclaw.db");

  private readonly db = new Database(this.dbPath);

  constructor() {
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("synchronous = NORMAL");
    this.initializeSchema();
  }

  private ensureTable(tableName: string, sql: string) {
    const existing = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(tableName);
    if (!existing) {
      this.db.exec(sql);
    }
  }

  private ensureColumn(tableName: string, columnName: string, columnSql: string) {
    const columns = this.db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name?: string }>;
    const exists = columns.some((column) => String(column.name || "") === columnName);
    if (!exists) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
    }
  }

  private initializeSchema() {
    const escapedProject = this.defaultProjectId.replace(/'/g, "''");

    this.ensureTable(
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

    this.ensureTable(
      "reports",
      `CREATE TABLE reports (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
        title text NOT NULL,
        content text NOT NULL,
        category text NOT NULL DEFAULT 'system',
        status text NOT NULL DEFAULT 'info',
        area text,
        linked_quest_id text,
        source text NOT NULL DEFAULT 'OpenClaw',
        metadata_json text NOT NULL DEFAULT '{}',
        date text NOT NULL
      )`,
    );
    this.ensureColumn("reports", "linked_quest_id", "linked_quest_id text");

    this.ensureTable(
      "quests",
      `CREATE TABLE quests (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
        goal text NOT NULL,
        difficulty text NOT NULL DEFAULT 'normal',
        topics_json text NOT NULL DEFAULT '[]',
        status text NOT NULL DEFAULT 'open',
        area text,
        completed integer NOT NULL DEFAULT 0,
        date text NOT NULL,
        completed_date text
      )`,
    );
    this.ensureColumn("quests", "project_id", `project_id text NOT NULL DEFAULT '${escapedProject}'`);
    this.ensureColumn("quests", "topics_json", "topics_json text NOT NULL DEFAULT '[]'");
    this.ensureColumn("quests", "status", "status text NOT NULL DEFAULT 'open'");
    this.ensureColumn("quests", "area", "area text");
    this.ensureColumn("quests", "completed_date", "completed_date text");
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS quests_user_project_status_date ON quests (user_id, project_id, status, completed, date)",
    );

    this.ensureTable(
      "notes",
      `CREATE TABLE notes (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
        content text NOT NULL,
        completed integer NOT NULL DEFAULT 0,
        created_at text NOT NULL,
        updated_at text NOT NULL
      )`,
    );

    this.ensureTable(
      "saved_views",
      `CREATE TABLE saved_views (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
        surface text NOT NULL,
        name text NOT NULL,
        filters_json text NOT NULL DEFAULT '{}',
        created_at text NOT NULL,
        updated_at text NOT NULL
      )`,
    );

    this.ensureTable(
      "automation_template_runs",
      `CREATE TABLE automation_template_runs (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
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
    this.ensureColumn(
      "automation_template_runs",
      "project_id",
      `project_id text NOT NULL DEFAULT '${escapedProject}'`,
    );
    this.ensureColumn(
      "automation_template_runs",
      "request_json",
      "request_json text NOT NULL DEFAULT '{}'",
    );
    this.ensureColumn(
      "automation_template_runs",
      "response_json",
      "response_json text NOT NULL DEFAULT '{}'",
    );
    this.ensureColumn("automation_template_runs", "completed_at", "completed_at text");
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS automation_template_runs_user_project_template_date ON automation_template_runs (user_id, project_id, template_id, created_at)",
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS automation_template_runs_user_project_status_date ON automation_template_runs (user_id, project_id, status, created_at)",
    );

    this.ensureTable(
      "automation_templates",
      `CREATE TABLE automation_templates (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
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
    this.ensureColumn(
      "automation_templates",
      "project_id",
      `project_id text NOT NULL DEFAULT '${escapedProject}'`,
    );
    this.ensureColumn(
      "automation_templates",
      "execution_env",
      "execution_env text NOT NULL DEFAULT 'worktree'",
    );
    this.ensureColumn("automation_templates", "webhook_path", "webhook_path text");
    this.ensureColumn("automation_templates", "area", "area text");
    this.ensureColumn(
      "automation_templates",
      "topics_json",
      "topics_json text NOT NULL DEFAULT '[]'",
    );
    this.ensureColumn("automation_templates", "last_run_at", "last_run_at text");
    this.ensureColumn("automation_templates", "last_run_status", "last_run_status text");
    this.ensureColumn("automation_templates", "last_run_summary", "last_run_summary text");
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS automation_templates_user_project_updated ON automation_templates (user_id, project_id, updated_at)",
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS automation_templates_user_project_status ON automation_templates (user_id, project_id, status, updated_at)",
    );

    this.ensureTable(
      "workspace_runs",
      `CREATE TABLE workspace_runs (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
        branch text NOT NULL,
        worktree_path text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        metadata_json text NOT NULL DEFAULT '{}',
        created_at text NOT NULL,
        closed_at text
      )`,
    );

    this.ensureTable(
      "workspace_run_dispatches",
      `CREATE TABLE workspace_run_dispatches (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
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
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS workspace_run_dispatches_user_project_run_started ON workspace_run_dispatches (user_id, project_id, run_id, started_at DESC)",
    );

    this.ensureTable(
      "agents",
      `CREATE TABLE agents (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
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
    this.ensureColumn("agents", "description", "description text");
    this.ensureColumn("agents", "executor", "executor text NOT NULL DEFAULT 'openclaw'");
    this.ensureColumn("agents", "status", "status text NOT NULL DEFAULT 'active'");
    this.ensureColumn("agents", "area", "area text");
    this.ensureColumn("agents", "topics_json", "topics_json text NOT NULL DEFAULT '[]'");
    this.ensureColumn("agents", "system_prompt", "system_prompt text NOT NULL DEFAULT ''");
    this.ensureColumn("agents", "model", "model text");
    this.ensureColumn("agents", "backend", "backend text NOT NULL DEFAULT 'openclaw'");
    this.ensureColumn("agents", "session_id", "session_id text");
    this.ensureColumn("agents", "source_pack", "source_pack text NOT NULL DEFAULT 'native'");
    this.ensureColumn("agents", "source_ref", "source_ref text");
    this.ensureColumn("agents", "workflow_json", "workflow_json text NOT NULL DEFAULT '{}'");
    this.ensureColumn("agents", "pack_assets_json", "pack_assets_json text NOT NULL DEFAULT '[]'");
    this.ensureColumn("agents", "handoff_agent_ids_json", "handoff_agent_ids_json text NOT NULL DEFAULT '[]'");
    this.ensureColumn("agents", "chain_policy", "chain_policy text NOT NULL DEFAULT 'manual'");
    this.ensureColumn("agents", "last_run_at", "last_run_at text");
    this.ensureColumn("agents", "last_run_status", "last_run_status text");
    this.ensureColumn("agents", "last_run_summary", "last_run_summary text");
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS agents_user_project_updated ON agents (user_id, project_id, updated_at)",
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS agents_user_project_status ON agents (user_id, project_id, status, updated_at)",
    );

    this.ensureTable(
      "directive_capabilities",
      `CREATE TABLE directive_capabilities (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
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

    this.ensureTable(
      "directive_experiments",
      `CREATE TABLE directive_experiments (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
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

    this.ensureTable(
      "directive_evaluations",
      `CREATE TABLE directive_evaluations (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
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

    this.ensureTable(
      "directive_decisions",
      `CREATE TABLE directive_decisions (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
        capability_id text NOT NULL REFERENCES directive_capabilities(id),
        evaluation_id text REFERENCES directive_evaluations(id),
        decision text NOT NULL,
        rationale text NOT NULL,
        decided_by text NOT NULL DEFAULT 'user',
        metadata_json text NOT NULL DEFAULT '{}',
        created_at text NOT NULL
      )`,
    );

    this.ensureTable(
      "directive_integrations",
      `CREATE TABLE directive_integrations (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
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
    this.ensureColumn(
      "directive_capabilities",
      "framework_status",
      "framework_status text NOT NULL DEFAULT 'intake'",
    );
    this.ensureColumn(
      "directive_capabilities",
      "runtime_status",
      "runtime_status text NOT NULL DEFAULT 'none'",
    );
    this.ensureColumn(
      "directive_integrations",
      "integration_mode",
      "integration_mode text NOT NULL DEFAULT 'adapt'",
    );
    this.ensureColumn(
      "directive_integrations",
      "target_runtime_surface",
      "target_runtime_surface text",
    );
    this.ensureColumn("directive_integrations", "owner", "owner text");
    this.ensureColumn("directive_integrations", "due_at", "due_at text");
    this.ensureColumn(
      "directive_integrations",
      "required_gates_json",
      "required_gates_json text NOT NULL DEFAULT '[]'",
    );
    this.ensureColumn(
      "directive_integrations",
      "proof_artifact_path",
      "proof_artifact_path text",
    );
    this.ensureColumn(
      "directive_integrations",
      "rollback_plan",
      "rollback_plan text",
    );
    this.db.exec(`
      UPDATE directive_capabilities
      SET framework_status = CASE
        WHEN status IN ('intake','analyzed','experimenting','evaluated','decided') THEN status
        WHEN status = 'integrated' THEN 'decided'
        ELSE 'intake'
      END
      WHERE COALESCE(framework_status, '') = ''
         OR framework_status NOT IN ('intake','analyzed','experimenting','evaluated','decided')
    `);
    this.db.exec(`
      UPDATE directive_capabilities
      SET runtime_status = CASE
        WHEN status = 'integrated' THEN 'callable'
        WHEN status = 'decided' THEN 'none'
        ELSE COALESCE(runtime_status, 'none')
      END
      WHERE COALESCE(runtime_status, '') = ''
         OR (status = 'integrated' AND runtime_status = 'none')
    `);
    this.db.exec(`
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

    this.ensureTable(
      "workflow_run_guards",
      `CREATE TABLE workflow_run_guards (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT '${escapedProject}',
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
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS workflow_run_guards_user_project_scope ON workflow_run_guards (user_id, project_id, scope_type, scope_id)",
    );
  }

  get connection() {
    return this.db;
  }

  get resolvedDbPath() {
    return this.dbPath;
  }

  onModuleDestroy() {
    this.db.close();
  }
}
