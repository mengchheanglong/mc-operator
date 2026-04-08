import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { AgentsExtrasError, AgentsExtrasService } from "./agents-extras.service";

@Controller("api/v1/agents")
export class AgentsExtrasController {
  constructor(private readonly agentsExtrasService: AgentsExtrasService) {}

  @Get(":id/pack-assets")
  async getPackAssets(@Param("id") id: string, @Query("projectId") projectId?: string) {
    try {
      return await this.agentsExtrasService.getPackAssets({
        projectId,
        agentId: id,
      });
    } catch (error) {
      if (error instanceof AgentsExtrasError) {
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

  @Post(":id/send")
  @HttpCode(200)
  async send(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    try {
      const result = await this.agentsExtrasService.send({
        projectId,
        agentId: id,
        message: body.message,
      });
      if (result.status !== 200) {
        throw new HttpException(result, result.status);
      }
      return { agent: result.agent, result: result.result };
    } catch (error) {
      if (error instanceof AgentsExtrasError) {
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
