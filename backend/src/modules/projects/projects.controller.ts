import { Controller, Get, NotFoundException, Query } from "@nestjs/common";
import { ProjectsService } from "./projects.service";

@Controller("api/v1/projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  listProjects(@Query("projectId") projectId?: string) {
    const payload = this.projectsService.list(projectId);
    if (!payload) {
      throw new NotFoundException("No projects are available.");
    }
    return payload;
  }

  @Get("graph")
  graphProjects(@Query("projectId") projectId?: string) {
    const payload = this.projectsService.graph(projectId);
    if (!payload) {
      throw new NotFoundException("No projects are available.");
    }
    return payload;
  }
}
