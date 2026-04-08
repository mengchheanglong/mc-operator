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

export const workspaceRunDispatches = sqliteTable(
  "workspace_run_dispatches",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    runId: text("run_id").notNull().references(() => workspaceRuns.id),
    agentId: text("agent_id").notNull(),
    sessionId: text("session_id"),
    model: text("model"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status").notNull().default("running"),
    failureClass: text("failure_class"),
    command: text("command"),
    reportId: text("report_id"),
    artifactPath: text("artifact_path"),
    metadataJson: text("metadata_json").notNull().default("{}"),
  },
  (table) => [
    index("workspace_run_dispatches_user_project_run_started").on(
      table.userId,
      table.projectId,
      table.runId,
      table.startedAt,
    ),
    index("workspace_run_dispatches_user_project_run_status").on(
      table.userId,
      table.projectId,
      table.runId,
      table.status,
    ),
  ],
);

export const directiveCapabilities = sqliteTable(
  "directive_capabilities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    sourceType: text("source_type").notNull().default("github-repo"),
    sourceRef: text("source_ref").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("intake"),
    frameworkStatus: text("framework_status").notNull().default("intake"),
    runtimeStatus: text("runtime_status").notNull().default("none"),
    workflowFamily: text("workflow_family").notNull(),
    userIntent: text("user_intent"),
    notesJson: text("notes_json").notNull().default("[]"),
    analysisSummary: text("analysis_summary"),
    category: text("category"),
    problemFit: text("problem_fit"),
    overlapNotes: text("overlap_notes"),
    riskNotes: text("risk_notes"),
    recommendation: text("recommendation"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("directive_capabilities_user_project_created").on(
      table.userId,
      table.projectId,
      table.createdAt,
    ),
    index("directive_capabilities_user_project_status_updated").on(
      table.userId,
      table.projectId,
      table.status,
      table.updatedAt,
    ),
    index("directive_capabilities_user_project_source_ref").on(
      table.userId,
      table.projectId,
      table.sourceRef,
    ),
  ],
);

export const directiveExperiments = sqliteTable(
  "directive_experiments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    capabilityId: text("capability_id").notNull().references(() => directiveCapabilities.id),
    runId: text("run_id").references(() => workspaceRuns.id),
    hypothesis: text("hypothesis").notNull(),
    plan: text("plan").notNull(),
    successCriteriaJson: text("success_criteria_json").notNull().default("[]"),
    status: text("status").notNull().default("proposed"),
    artifactPath: text("artifact_path"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("directive_experiments_user_project_capability_created").on(
      table.userId,
      table.projectId,
      table.capabilityId,
      table.createdAt,
    ),
    index("directive_experiments_user_project_status_updated").on(
      table.userId,
      table.projectId,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const directiveEvaluations = sqliteTable(
  "directive_evaluations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    capabilityId: text("capability_id").notNull().references(() => directiveCapabilities.id),
    experimentId: text("experiment_id").notNull().references(() => directiveExperiments.id),
    outcome: text("outcome").notNull().default("inconclusive"),
    usefulness: text("usefulness"),
    friction: text("friction"),
    workflowImpact: text("workflow_impact"),
    evidenceSummary: text("evidence_summary").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("directive_evaluations_user_project_capability_created").on(
      table.userId,
      table.projectId,
      table.capabilityId,
      table.createdAt,
    ),
    index("directive_evaluations_user_project_experiment").on(
      table.userId,
      table.projectId,
      table.experimentId,
      table.createdAt,
    ),
  ],
);

export const directiveDecisions = sqliteTable(
  "directive_decisions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    capabilityId: text("capability_id").notNull().references(() => directiveCapabilities.id),
    evaluationId: text("evaluation_id").references(() => directiveEvaluations.id),
    decision: text("decision").notNull(),
    rationale: text("rationale").notNull(),
    decidedBy: text("decided_by").notNull().default("user"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("directive_decisions_user_project_capability_created").on(
      table.userId,
      table.projectId,
      table.capabilityId,
      table.createdAt,
    ),
  ],
);

export const directiveIntegrations = sqliteTable(
  "directive_integrations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    capabilityId: text("capability_id").notNull().references(() => directiveCapabilities.id),
    decisionId: text("decision_id").notNull().references(() => directiveDecisions.id),
    status: text("status").notNull().default("planned"),
    integrationMode: text("integration_mode").notNull().default("adapt"),
    integrationSurface: text("integration_surface").notNull(),
    targetRuntimeSurface: text("target_runtime_surface"),
    owner: text("owner"),
    dueAt: text("due_at"),
    requiredGatesJson: text("required_gates_json").notNull().default("[]"),
    proofArtifactPath: text("proof_artifact_path"),
    rollbackPlan: text("rollback_plan"),
    dependencyNotes: text("dependency_notes"),
    rollbackNotes: text("rollback_notes"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("directive_integrations_user_project_capability_created").on(
      table.userId,
      table.projectId,
      table.capabilityId,
      table.createdAt,
    ),
    index("directive_integrations_user_project_status_updated").on(
      table.userId,
      table.projectId,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const orchestratorReliabilityStats = sqliteTable(
  "orchestrator_reliability_stats",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    createTotal: integer("create_total").notNull().default(0),
    createSuccess: integer("create_success").notNull().default(0),
    dispatchTotal: integer("dispatch_total").notNull().default(0),
    dispatchSuccess: integer("dispatch_success").notNull().default(0),
    closeTotal: integer("close_total").notNull().default(0),
    closeSuccess: integer("close_success").notNull().default(0),
    overlapBlockCount: integer("overlap_block_count").notNull().default(0),
    staleCleanupCount: integer("stale_cleanup_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("orchestrator_reliability_user_project").on(
      table.userId,
      table.projectId,
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
