import { Body, Controller, Get, NotFoundException, Put, Query } from "@nestjs/common";
import { ProjectsService } from "./projects.service";

@Controller("api/v1/projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get("active")
  getActiveProject() {
    const payload = this.projectsService.active();
    if (!payload) {
      throw new NotFoundException("No projects are available.");
    }
    return payload;
  }

  @Put("active")
  setActiveProject(@Body() body: { projectId?: unknown }) {
    const payload = this.projectsService.activate(body?.projectId);
    if (!payload) {
      throw new NotFoundException("No projects are available.");
    }
    return payload;
  }

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
