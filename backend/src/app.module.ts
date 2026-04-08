import { Module } from "@nestjs/common";
import { SqliteService } from "./infra/sqlite/sqlite.service";
import { ProjectPathsService } from "./infra/project-paths.service";
import { HealthController } from "./modules/health/health.controller";
import { DirectiveWorkspaceController } from "./modules/directive-workspace/directive-workspace.controller";
import { DirectiveWorkspaceService } from "./modules/directive-workspace/directive-workspace.service";
import { ReportsController } from "./modules/reports/reports.controller";
import { ReportsService } from "./modules/reports/reports.service";
import { ProjectsController } from "./modules/projects/projects.controller";
import { ProjectsService } from "./modules/projects/projects.service";
import { NotesController } from "./modules/notes/notes.controller";
import { NotesService } from "./modules/notes/notes.service";
import { ViewsController } from "./modules/views/views.controller";
import { ViewsService } from "./modules/views/views.service";
import { QuestsController } from "./modules/quests/quests.controller";
import { QuestsService } from "./modules/quests/quests.service";
import { DocsController } from "./modules/docs/docs.controller";
import { DocsService } from "./modules/docs/docs.service";
import { AutomationRunsController } from "./modules/automation-runs/automation-runs.controller";
import { AutomationRunsService } from "./modules/automation-runs/automation-runs.service";
import { AutomationRunToolsController } from "./modules/automation-run-tools/automation-run-tools.controller";
import { AutomationRunToolsService } from "./modules/automation-run-tools/automation-run-tools.service";
import { AutomationHealthController } from "./modules/automation-health/automation-health.controller";
import { AutomationHealthService } from "./modules/automation-health/automation-health.service";
import { AutomationTemplateExecuteController } from "./modules/automation-template-execute/automation-template-execute.controller";
import { AutomationTemplateExecuteService } from "./modules/automation-template-execute/automation-template-execute.service";
import { WorkflowGuardsController } from "./modules/workflow-guards/workflow-guards.controller";
import { WorkflowGuardsService } from "./modules/workflow-guards/workflow-guards.service";
import { OpsHealthController } from "./modules/ops-health/ops-health.controller";
import { OpsHealthService } from "./modules/ops-health/ops-health.service";
import { AgentsRuntimeController } from "./modules/agents-runtime/agents-runtime.controller";
import { AgentsRuntimeService } from "./modules/agents-runtime/agents-runtime.service";
import { AgentsDispatchController } from "./modules/agents-dispatch/agents-dispatch.controller";
import { AgentsDispatchService } from "./modules/agents-dispatch/agents-dispatch.service";
import { AgentsCatalogController } from "./modules/agents-catalog/agents-catalog.controller";
import { AgentsCatalogService } from "./modules/agents-catalog/agents-catalog.service";
import { AgentsImportPacksController } from "./modules/agents-import-packs/agents-import-packs.controller";
import { AgentsImportPacksService } from "./modules/agents-import-packs/agents-import-packs.service";
import { AgentsExtrasController } from "./modules/agents-extras/agents-extras.controller";
import { AgentsExtrasService } from "./modules/agents-extras/agents-extras.service";
import { ContextExportController } from "./modules/context-export/context-export.controller";
import { ContextExportService } from "./modules/context-export/context-export.service";
import { AutomationSessionBriefController } from "./modules/automation-session-brief/automation-session-brief.controller";
import { AutomationSessionBriefService } from "./modules/automation-session-brief/automation-session-brief.service";
import { CodeGraphIndexController } from "./modules/code-graph-index/code-graph-index.controller";
import { CodeGraphIndexService } from "./modules/code-graph-index/code-graph-index.service";
import { WorkspaceBootstrapController } from "./modules/workspace-bootstrap/workspace-bootstrap.controller";
import { WorkspaceBootstrapService } from "./modules/workspace-bootstrap/workspace-bootstrap.service";
import { OpsNightlyController } from "./modules/ops-nightly/ops-nightly.controller";
import { OpsNightlyService } from "./modules/ops-nightly/ops-nightly.service";

@Module({
  controllers: [
    HealthController,
    DirectiveWorkspaceController,
    ReportsController,
    ProjectsController,
    NotesController,
    ViewsController,
    QuestsController,
    DocsController,
    AutomationRunsController,
    AutomationRunToolsController,
    AutomationHealthController,
    AutomationTemplateExecuteController,
    WorkflowGuardsController,
    OpsHealthController,
    AgentsRuntimeController,
    AgentsDispatchController,
    AgentsCatalogController,
    AgentsImportPacksController,
    AgentsExtrasController,
    ContextExportController,
    AutomationSessionBriefController,
    CodeGraphIndexController,
    WorkspaceBootstrapController,
    OpsNightlyController,
  ],
  providers: [
    SqliteService,
    ProjectPathsService,
    DirectiveWorkspaceService,
    ReportsService,
    ProjectsService,
    NotesService,
    ViewsService,
    QuestsService,
    DocsService,
    AutomationRunsService,
    AutomationRunToolsService,
    AutomationHealthService,
    AutomationTemplateExecuteService,
    WorkflowGuardsService,
    OpsHealthService,
    AgentsRuntimeService,
    AgentsDispatchService,
    AgentsCatalogService,
    AgentsImportPacksService,
    AgentsExtrasService,
    ContextExportService,
    AutomationSessionBriefService,
    CodeGraphIndexService,
    WorkspaceBootstrapService,
    OpsNightlyService,
  ],
})
export class AppModule {}
