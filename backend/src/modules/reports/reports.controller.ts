import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { ReportsService } from "./reports.service";

@Controller("api/v1/reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @HttpCode(200)
  createReport(
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    const report = this.reportsService.create({
      ...body,
      projectId,
    });
    return {
      msg: "Report created.",
      report,
    };
  }

  @Get()
  listReports(
    @Query("projectId") projectId?: string,
    @Query("view") view?: string,
    @Query("limit") limitRaw?: string,
    @Query("skip") skipRaw?: string,
    @Query("withMeta") withMetaRaw?: string,
    @Query("category") category?: string,
    @Query("status") status?: string,
    @Query("area") area?: string,
    @Query("linkedQuestId") linkedQuestId?: string,
  ) {
    if (view === "daily") {
      return {
        days: this.reportsService.listDaily(projectId),
      };
    }

    const parsedLimit = Number.parseInt(limitRaw || "50", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 100))
      : 50;
    const parsedSkip = Number.parseInt(skipRaw || "0", 10);
    const skip = Number.isFinite(parsedSkip) ? Math.max(0, parsedSkip) : 0;

    return this.reportsService.list({
      projectId,
      category,
      status,
      area,
      linkedQuestId,
      limit,
      skip,
      withMeta: withMetaRaw === "1",
    });
  }

  @Delete(":id")
  deleteReport(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    const deleted = this.reportsService.delete({ id, projectId });
    if (!deleted) {
      throw new NotFoundException("Report not found.");
    }
    return {
      msg: "Report deleted.",
    };
  }
}
