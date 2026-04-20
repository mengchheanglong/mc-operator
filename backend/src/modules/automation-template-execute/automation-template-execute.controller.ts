import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Put,
  Post,
  Query,
} from "@nestjs/common";
import {
  AutomationTemplateExecuteError,
  AutomationTemplateExecuteService,
} from "./automation-template-execute.service";

const inFlightTemplateRuns = new Set<string>();

@Controller("api/v1/automation/templates")
export class AutomationTemplateExecuteController {
  constructor(
    private readonly automationTemplateExecuteService: AutomationTemplateExecuteService,
  ) {}

  @Get()
  async listTemplates(@Query("projectId") projectId: string | undefined) {
    return this.automationTemplateExecuteService.listTemplateCatalog({
      projectId,
    });
  }

  @Post()
  @HttpCode(200)
  async createTemplate(
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId: string | undefined,
  ) {
    try {
      return await this.automationTemplateExecuteService.createTemplateCatalogEntry({
        projectId,
        body,
      });
    } catch (error) {
      if (error instanceof AutomationTemplateExecuteError) {
        throw new HttpException(
          {
            msg: error.message,
            code: error.code,
            ...error.details,
          },
          error.status,
        );
      }
      throw error;
    }
  }

  @Put(":id")
  async updateTemplate(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId: string | undefined,
  ) {
    try {
      return await this.automationTemplateExecuteService.updateTemplateCatalogEntry({
        projectId,
        templateId: id,
        body,
      });
    } catch (error) {
      if (error instanceof AutomationTemplateExecuteError) {
        throw new HttpException(
          {
            msg: error.message,
            code: error.code,
            ...error.details,
          },
          error.status,
        );
      }
      throw error;
    }
  }

  @Delete(":id")
  async deleteTemplate(
    @Param("id") id: string,
    @Query("projectId") projectId: string | undefined,
  ) {
    try {
      return await this.automationTemplateExecuteService.deleteTemplateCatalogEntry({
        projectId,
        templateId: id,
      });
    } catch (error) {
      if (error instanceof AutomationTemplateExecuteError) {
        throw new HttpException(
          {
            msg: error.message,
            code: error.code,
            ...error.details,
          },
          error.status,
        );
      }
      throw error;
    }
  }

  @Get(":id/runs")
  async listTemplateRuns(
    @Param("id") id: string,
    @Query("projectId") projectId: string | undefined,
  ) {
    try {
      return await this.automationTemplateExecuteService.listTemplateRunHistory({
        projectId,
        templateId: id,
      });
    } catch (error) {
      if (error instanceof AutomationTemplateExecuteError) {
        throw new HttpException(
          {
            msg: error.message,
            code: error.code,
            ...error.details,
          },
          error.status,
        );
      }
      throw error;
    }
  }

  @Post(":id/execute")
  @HttpCode(200)
  async executeTemplate(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId: string | undefined,
  ) {
    const lockKey = `${projectId || "mc-operator"}:${id}`;
    if (inFlightTemplateRuns.has(lockKey)) {
      throw new HttpException(
        {
          msg: "Template execution already in flight.",
          code: "single_flight_lock",
        },
        409,
      );
    }

    inFlightTemplateRuns.add(lockKey);
    try {
      const result = await this.automationTemplateExecuteService.executeTemplate({
        projectId,
        templateId: id,
        deepMode: body?.deepMode,
      });
      if (result.statusCode !== 200) {
        throw new HttpException(result.payload, result.statusCode);
      }
      return result.payload;
    } catch (error) {
      if (error instanceof AutomationTemplateExecuteError) {
        throw new HttpException(
          {
            msg: error.message,
            code: error.code,
            ...error.details,
          },
          error.status,
        );
      }
      throw error;
    } finally {
      inFlightTemplateRuns.delete(lockKey);
    }
  }

  @Post(":id/run")
  @HttpCode(200)
  async runTemplate(
    @Param("id") id: string,
    @Query("projectId") projectId: string | undefined,
  ) {
    const lockKey = `${projectId || "mc-operator"}:${id}`;
    if (inFlightTemplateRuns.has(lockKey)) {
      throw new HttpException(
        {
          msg: "Template execution already in flight.",
          code: "single_flight_lock",
        },
        409,
      );
    }

    inFlightTemplateRuns.add(lockKey);
    try {
      const result = await this.automationTemplateExecuteService.runTemplate({
        projectId,
        templateId: id,
      });
      if (result.statusCode !== 200) {
        throw new HttpException(result.payload, result.statusCode);
      }
      return result.payload;
    } catch (error) {
      if (error instanceof AutomationTemplateExecuteError) {
        throw new HttpException(
          {
            msg: error.message,
            code: error.code,
            ...error.details,
          },
          error.status,
        );
      }
      throw error;
    } finally {
      inFlightTemplateRuns.delete(lockKey);
    }
  }

  @Post(":id/check")
  @HttpCode(200)
  async checkTemplate(
    @Param("id") id: string,
    @Query("projectId") projectId: string | undefined,
  ) {
    const lockKey = `${projectId || "mc-operator"}:${id}`;
    if (inFlightTemplateRuns.has(lockKey)) {
      throw new HttpException(
        {
          msg: "Template execution already in flight.",
          code: "single_flight_lock",
        },
        409,
      );
    }

    inFlightTemplateRuns.add(lockKey);
    try {
      const result = await this.automationTemplateExecuteService.checkTemplate({
        projectId,
        templateId: id,
      });
      if (result.statusCode !== 200) {
        throw new HttpException(result.payload, result.statusCode);
      }
      return result.payload;
    } catch (error) {
      if (error instanceof AutomationTemplateExecuteError) {
        throw new HttpException(
          {
            msg: error.message,
            code: error.code,
            ...error.details,
          },
          error.status,
        );
      }
      throw error;
    } finally {
      inFlightTemplateRuns.delete(lockKey);
    }
  }
}
