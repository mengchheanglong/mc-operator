import { Body, Controller, HttpCode, HttpException, Param, Post, Query } from "@nestjs/common";
import { AgentsDispatchError, AgentsDispatchService } from "./agents-dispatch.service";

@Controller("api/v1/agents")
export class AgentsDispatchController {
  constructor(private readonly agentsDispatchService: AgentsDispatchService) {}

  @Post(":id/dispatch")
  @HttpCode(200)
  async dispatch(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    try {
      return await this.agentsDispatchService.dispatch({
        projectId,
        agentId: id,
        task: body.task,
        deepMode: body.deepMode,
        allowOpenClawFallback: body.allowOpenClawFallback,
        runId: body.runId,
      });
    } catch (error) {
      if (error instanceof AgentsDispatchError) {
        const payload = error.details?.msg
          ? error.details
          : {
              msg: error.message,
              reason: error.reason,
              ...error.details,
            };
        throw new HttpException(payload, error.status);
      }
      throw error;
    }
  }
}
