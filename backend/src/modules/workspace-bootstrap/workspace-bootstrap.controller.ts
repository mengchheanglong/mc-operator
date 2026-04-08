import { Controller, HttpCode, Post, Query } from "@nestjs/common";
import { WorkspaceBootstrapService } from "./workspace-bootstrap.service";

@Controller("api/v1/workspace")
export class WorkspaceBootstrapController {
  constructor(
    private readonly workspaceBootstrapService: WorkspaceBootstrapService,
  ) {}

  @Post("bootstrap")
  @HttpCode(200)
  bootstrapWorkspace(@Query("projectId") projectId?: string) {
    return this.workspaceBootstrapService.bootstrap(projectId);
  }
}
