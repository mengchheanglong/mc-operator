import { Body, Controller, HttpCode, HttpException, Post, Query } from "@nestjs/common";
import { AgentsImportPacksError, AgentsImportPacksService } from "./agents-import-packs.service";

@Controller("api/v1/agents")
export class AgentsImportPacksController {
  constructor(private readonly agentsImportPacksService: AgentsImportPacksService) {}

  @Post("import-packs")
  @HttpCode(200)
  async importPacks(@Body() body: Record<string, unknown>, @Query("projectId") projectId?: string) {
    try {
      return await this.agentsImportPacksService.importPacks({
        projectId,
        body,
      });
    } catch (error) {
      if (error instanceof AgentsImportPacksError) {
        throw new HttpException(
          {
            msg: error.message,
            reason: error.reason,
            ...error.details,
          },
          error.status,
        );
      }
      throw error;
    }
  }
}
