import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { AutomationRunToolsService } from "./automation-run-tools.service";

@Controller("api/v1/automation/runs")
export class AutomationRunToolsController {
  constructor(private readonly automationRunToolsService: AutomationRunToolsService) {}

  private normalizeTimeoutMs(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 45_000;
    return Math.min(180_000, Math.max(5_000, Math.floor(parsed)));
  }

  private normalizeMinChars(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(50_000, Math.max(0, Math.floor(parsed)));
  }

  @Post(":id/tools")
  @HttpCode(200)
  async invokeTools(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    try {
      const payload = await this.automationRunToolsService.invokeTools({
        projectId,
        runId: id,
        toolId: body?.toolId,
        timeoutMs: this.normalizeTimeoutMs(body?.timeoutMs),
        minChars: this.normalizeMinChars(body?.minChars),
        content: body?.content,
        profile: body?.profile,
        includeDirectories: body?.includeDirectories,
      });

      return {
        msg:
          payload.run.status === "success"
            ? "Run tool completed."
            : "Run tool completed with errors.",
        canonicalToolId: payload.canonicalToolId,
        run: payload.run,
        deprecation: payload.deprecated
          ? {
              toolId: payload.requestedToolId,
              canonicalToolId: payload.canonicalToolId,
              redirectedToolId: payload.canonicalToolId,
              message:
                "tooling-audit is deprecated and now executed through desloppify-prototype.",
            }
          : null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("invalid_input:")) {
        throw new HttpException({ msg: message, reason: "invalid_input" }, 400);
      }
      throw error;
    }
  }

  @Post(":id/tooling-audit")
  @HttpCode(200)
  async invokeToolingAudit(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    try {
      const payload = await this.automationRunToolsService.invokeToolingAudit({
        projectId,
        runId: id,
        timeoutMs: this.normalizeTimeoutMs(body?.timeoutMs),
        minChars: this.normalizeMinChars(body?.minChars),
        content: body?.content,
      });
      return {
        msg:
          payload.run.status === "success"
            ? "Tooling audit completed."
            : "Tooling audit completed with errors.",
        canonicalToolId: payload.canonicalToolId,
        deprecated: payload.deprecated,
        run: payload.run,
        deprecation: {
          toolId: "tooling-audit",
          canonicalToolId: payload.canonicalToolId,
          redirectedToolId: "desloppify-prototype",
          message:
            "tooling-audit endpoint is deprecated and internally mapped to desloppify-prototype.",
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("invalid_input:")) {
        throw new HttpException({ msg: message, reason: "invalid_input" }, 400);
      }
      throw error;
    }
  }
}

