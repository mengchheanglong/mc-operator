import { Controller, Get, Query } from "@nestjs/common";
import { WorkflowGuardsService, type WorkflowGuardScopeType } from "./workflow-guards.service";

@Controller("api/v1/workflow/guards")
export class WorkflowGuardsController {
  constructor(private readonly workflowGuardsService: WorkflowGuardsService) {}

  @Get()
  listWorkflowGuards(
    @Query("projectId") projectId?: string,
    @Query("scope") scope?: string,
  ) {
    const scopeType: WorkflowGuardScopeType =
      String(scope || "").trim() === "automation" ? "automation" : "agent";
    const resolvedProjectId = String(projectId || "").trim() || "mc-operator";
    const guards = this.workflowGuardsService.list({
      projectId: resolvedProjectId,
      scopeType,
    });
    return { guards };
  }
}
