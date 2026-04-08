import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { DirectiveWorkspaceService } from "./directive-workspace.service";

@Controller("api/v1/directive-workspace")
export class DirectiveWorkspaceController {
  constructor(
    private readonly directiveWorkspaceService: DirectiveWorkspaceService,
  ) {}

  @Get("capabilities")
  listCapabilities(
    @Query("projectId") projectId?: string,
    @Query("status") status?: string,
  ) {
    return {
      v0: "directive-workspace",
      capabilities: this.directiveWorkspaceService.listCapabilities(
        projectId,
        status,
      ),
    };
  }

  @Post("capabilities")
  createCapability(@Body() body: Record<string, unknown>) {
    return {
      ok: true,
      capability: this.directiveWorkspaceService.createCapability(body),
    };
  }

  @Get("capabilities/:id")
  getCapabilityById(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    return this.directiveWorkspaceService.getCapabilityById(id, projectId);
  }

  @Post("capabilities/:id/analysis")
  @HttpCode(200)
  recordAnalysis(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return {
      ok: true,
      capability: this.directiveWorkspaceService.recordAnalysis(id, body),
    };
  }

  @Post("capabilities/:id/experiments")
  createExperiment(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return {
      ok: true,
      experiment: this.directiveWorkspaceService.createExperiment(id, body),
    };
  }

  @Post("capabilities/:id/evaluations")
  recordEvaluation(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return {
      ok: true,
      evaluation: this.directiveWorkspaceService.recordEvaluation(id, body),
    };
  }

  @Post("capabilities/:id/decision")
  recordDecision(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return {
      ok: true,
      ...this.directiveWorkspaceService.recordDecision(id, body),
    };
  }

  @Post("capabilities/:id/proof")
  async createProof(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return {
      ok: true,
      ...(await this.directiveWorkspaceService.createIntegrationProof(id, body)),
    };
  }

  @Post("capabilities/:id/lifecycle")
  @HttpCode(200)
  runLifecycle(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const lifecycle = this.directiveWorkspaceService.runLifecycle(id, body);
    return {
      ok: lifecycle.ok,
      lifecycle,
    };
  }

  @Get("capabilities/:id/lifecycle")
  getLifecycle(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    return this.directiveWorkspaceService.getCapabilityLifecycle(id, projectId);
  }

  @Get("registry")
  listRegistry(
    @Query("projectId") projectId?: string,
    @Query("status") status?: string,
  ) {
    return {
      v0: "directive-workspace",
      registry: this.directiveWorkspaceService.listRegistry(projectId, status),
    };
  }

  @Get("workspace/overview")
  workspaceOverview() {
    return {
      v0: "directive-workspace",
      workspace: this.directiveWorkspaceService.getStandaloneWorkspaceOverview(),
    };
  }

  @Get("discovery/overview")
  discoveryOverview() {
    return {
      v0: "directive-workspace",
      discovery: this.directiveWorkspaceService.getDiscoveryOverview(),
    };
  }

  @Get("architecture/overview")
  architectureOverview() {
    return {
      v0: "directive-workspace",
      architecture: this.directiveWorkspaceService.getArchitectureOverview(),
    };
  }
}
