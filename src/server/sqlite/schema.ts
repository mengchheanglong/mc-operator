import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Adventurer"),
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  joinDate: text("join_date").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const quests = sqliteTable(
  "quests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    goal: text("goal").notNull(),
    difficulty: text("difficulty").notNull().default("normal"),
    status: text("status").notNull().default("open"),
    area: text("area"),
    topicsJson: text("topics_json").notNull().default("[]"),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    date: text("date").notNull(),
    completedDate: text("completed_date"),
  },
  (table) => [
    index("quests_user_project_status_date").on(
      table.userId,
      table.projectId,
      table.status,
      table.completed,
      table.date,
    ),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    content: text("content").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("notes_user_project_status_updated").on(
      table.userId,
      table.projectId,
      table.completed,
      table.updatedAt,
    ),
  ],
);

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull().default("system"),
    status: text("status").notNull().default("info"),
    area: text("area"),
    linkedQuestId: text("linked_quest_id"),
    source: text("source").notNull().default("OpenClaw"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    date: text("date").notNull(),
  },
  (table) => [
    index("reports_user_project_date").on(table.userId, table.projectId, table.date),
    index("reports_user_project_area_date").on(table.userId, table.projectId, table.area, table.date),
    index("reports_user_project_linked_quest").on(table.userId, table.projectId, table.linkedQuestId),
  ],
);

export const savedViews = sqliteTable(
  "saved_views",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    surface: text("surface").notNull(),
    name: text("name").notNull(),
    filtersJson: text("filters_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("saved_views_user_project_surface_updated").on(
      table.userId,
      table.projectId,
      table.surface,
      table.updatedAt,
    ),
  ],
);

export const automationTemplateRuns = sqliteTable(
  "automation_template_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    templateId: text("template_id").notNull(),
    mode: text("mode").notNull().default("execute"),
    status: text("status").notNull().default("queued"),
    summary: text("summary"),
    idempotencyKey: text("idempotency_key"),
    targetUrl: text("target_url"),
    requestJson: text("request_json").notNull().default("{}"),
    responseJson: text("response_json").notNull().default("{}"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("automation_template_runs_user_project_template_date").on(
      table.userId,
      table.projectId,
      table.templateId,
      table.createdAt,
    ),
    index("automation_template_runs_user_project_status_date").on(
      table.userId,
      table.projectId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const automationTemplates = sqliteTable(
  "automation_templates",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    executor: text("executor").notNull().default("codex"),
    executionEnv: text("execution_env").notNull().default("worktree"),
    webhookPath: text("webhook_path"),
    status: text("status").notNull().default("active"),
    area: text("area"),
    topicsJson: text("topics_json").notNull().default("[]"),
    lastRunAt: text("last_run_at"),
    lastRunStatus: text("last_run_status"),
    lastRunSummary: text("last_run_summary"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("automation_templates_user_project_updated").on(
      table.userId,
      table.projectId,
      table.updatedAt,
    ),
    index("automation_templates_user_project_status").on(
      table.userId,
      table.projectId,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const workspaceRuns = sqliteTable(
  "workspace_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    branch: text("branch").notNull(),
    worktreePath: text("worktree_path").notNull(),
    status: text("status").notNull().default("active"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    closedAt: text("closed_at"),
  },
  (table) => [
    index("workspace_runs_user_project_created").on(
      table.userId,
      table.projectId,
      table.createdAt,
    ),
    index("workspace_runs_user_project_branch_status").on(
      table.userId,
      table.projectId,
      table.branch,
      table.status,
    ),
  ],
);

export const workflowRunGuards = sqliteTable(
  "workflow_run_guards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    runSignature: text("run_signature").notNull(),
    repeatFailureCount: integer("repeat_failure_count").notNull().default(0),
    duplicateHitCount: integer("duplicate_hit_count").notNull().default(0),
    reanalysisRequired: integer("reanalysis_required", { mode: "boolean" }).notNull().default(false),
    lastCostRiskTier: text("last_cost_risk_tier").notNull().default("low"),
    lastCostRiskLabel: text("last_cost_risk_label").notNull().default("cost-risk/low"),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("workflow_run_guards_user_project_scope").on(
      table.userId,
      table.projectId,
      table.scopeType,
      table.scopeId,
    ),
  ],
);

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    name: text("name").notNull(),
    role: text("role").notNull().default("builder"),
    description: text("description"),
    executor: text("executor").notNull().default("openclaw"),
    status: text("status").notNull().default("active"),
    area: text("area"),
    topicsJson: text("topics_json").notNull().default("[]"),
    systemPrompt: text("system_prompt").notNull().default(""),
    model: text("model"),
    backend: text("backend").notNull().default("openclaw"),
    sessionId: text("session_id"),
    sourcePack: text("source_pack").notNull().default("native"),
    sourceRef: text("source_ref"),
    workflowJson: text("workflow_json").notNull().default("{}"),
    packAssetsJson: text("pack_assets_json").notNull().default("[]"),
    handoffAgentIdsJson: text("handoff_agent_ids_json").notNull().default("[]"),
    chainPolicy: text("chain_policy").notNull().default("manual"),
    lastRunAt: text("last_run_at"),
    lastRunStatus: text("last_run_status"),
    lastRunSummary: text("last_run_summary"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("agents_user_project_updated").on(
      table.userId,
      table.projectId,
      table.updatedAt,
    ),
    index("agents_user_project_status").on(
      table.userId,
      table.projectId,
      table.status,
      table.updatedAt,
    ),
  ],
);
