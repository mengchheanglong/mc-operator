import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ViewsService } from "./views.service";

@Controller("api/v1/views")
export class ViewsController {
  constructor(private readonly viewsService: ViewsService) {}

  @Get()
  listViews(
    @Query("projectId") projectId?: string,
    @Query("surface") surface?: string,
  ) {
    return {
      views: this.viewsService.list(projectId, surface),
    };
  }

  @Post()
  @HttpCode(200)
  createView(
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    return {
      msg: "Saved view created.",
      view: this.viewsService.create({
        ...body,
        projectId,
      }),
    };
  }

  @Delete(":id")
  @HttpCode(200)
  deleteView(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    this.viewsService.delete({ id, projectId });
    return {
      msg: "Saved view deleted.",
    };
  }
}
