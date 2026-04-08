import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { AgentsCatalogError, AgentsCatalogService } from "./agents-catalog.service";

@Controller("api/v1/agents")
export class AgentsCatalogController {
  constructor(private readonly agentsCatalogService: AgentsCatalogService) {}

  @Get()
  async list(@Query("projectId") projectId?: string) {
    try {
      return await this.agentsCatalogService.list({ projectId });
    } catch (error) {
      if (error instanceof AgentsCatalogError) {
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

  @Post()
  @HttpCode(200)
  async create(@Body() body: Record<string, unknown>, @Query("projectId") projectId?: string) {
    try {
      return await this.agentsCatalogService.create({ projectId, body });
    } catch (error) {
      if (error instanceof AgentsCatalogError) {
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

  @Put(":id")
  @HttpCode(200)
  async update(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    try {
      return await this.agentsCatalogService.update({
        projectId,
        agentId: id,
        body,
      });
    } catch (error) {
      if (error instanceof AgentsCatalogError) {
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

  @Delete(":id")
  @HttpCode(200)
  async remove(@Param("id") id: string, @Query("projectId") projectId?: string) {
    try {
      return await this.agentsCatalogService.remove({
        projectId,
        agentId: id,
      });
    } catch (error) {
      if (error instanceof AgentsCatalogError) {
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
