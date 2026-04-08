import { Controller, Get, Query } from "@nestjs/common";
import { ContextExportService } from "./context-export.service";

@Controller("api/v1/context")
export class ContextExportController {
  constructor(private readonly contextExportService: ContextExportService) {}

  @Get("export")
  exportContext(
    @Query("projectId") projectId?: string,
    @Query("focusType") focusType?: string,
    @Query("focusId") focusId?: string,
    @Query("tier") tier?: string,
  ) {
    const pack = this.contextExportService.buildContextPack({
      projectId,
      focusType,
      focusId,
      tier,
    });

    return {
      success: true,
      pack,
    };
  }
}
