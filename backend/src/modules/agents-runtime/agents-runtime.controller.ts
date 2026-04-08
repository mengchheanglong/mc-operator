import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  AgentsRuntimeError,
  AgentsRuntimeService,
} from "./agents-runtime.service";

@Controller("api/v1/agents")
export class AgentsRuntimeController {
  constructor(private readonly agentsRuntimeService: AgentsRuntimeService) {}

  @Get(":id/status")
  async status(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
    @Query("includeSessions") includeSessions?: string,
  ) {
    try {
      const payload = await this.agentsRuntimeService.getStatus({
        projectId,
        agentId: id,
        includeSessions: includeSessions === "1",
      });
      if (!payload.status.ok) {
        throw new HttpException(payload, HttpStatus.BAD_GATEWAY);
      }
      return payload;
    } catch (error) {
      if (error instanceof AgentsRuntimeError) {
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

  @Post(":id/kill")
  @HttpCode(200)
  async kill(@Param("id") id: string, @Query("projectId") projectId?: string) {
    try {
      return await this.agentsRuntimeService.killSession({
        projectId,
        agentId: id,
      });
    } catch (error) {
      if (error instanceof AgentsRuntimeError) {
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

  @Post(":id/restore")
  @HttpCode(200)
  async restore(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    try {
      return await this.agentsRuntimeService.restoreSession({
        projectId,
        agentId: id,
      });
    } catch (error) {
      if (error instanceof AgentsRuntimeError) {
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
