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
import {
  AutomationRunsService,
  type WorkspaceRunCloseReason,
  WorkspaceRunError,
} from "./automation-runs.service";

const inFlightCreateLocks = new Set<string>();
const inFlightCloseLocks = new Set<string>();

function parseCloseReason(value: unknown): WorkspaceRunCloseReason {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "stale" || normalized === "error-recovery") {
    return normalized;
  }
  return "manual";
}

@Controller("api/v1/automation/runs")
export class AutomationRunsController {
  constructor(private readonly automationRunsService: AutomationRunsService) {}

  @Get()
  async listRuns(@Query("projectId") projectId?: string) {
    return this.automationRunsService.listRuns({ projectId });
  }

  @Post()
  @HttpCode(200)
  async createRun(
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    const branch = String(body.branch || "").trim();
    const lockKey = `${projectId || "mc-operator"}:${branch}`;

    if (inFlightCreateLocks.has(lockKey)) {
      throw new HttpException(
        {
          msg: "Run creation is already in flight.",
          reason: "single_flight_lock",
          nextCommand: "Wait for current create operation to complete and retry.",
        },
        409,
      );
    }

    inFlightCreateLocks.add(lockKey);
    try {
      const run = await this.automationRunsService.createRun({
        projectId,
        branch,
        metadata: body.metadata,
      });
      return {
        msg: "Workspace run created.",
        run,
      };
    } catch (error) {
      if (error instanceof WorkspaceRunError) {
        throw new HttpException(
          {
            msg: error.message,
            reason: error.reason,
            nextCommand: error.nextCommand,
            artifactPath: error.artifactPath,
          },
          error.status,
        );
      }
      throw error;
    } finally {
      inFlightCreateLocks.delete(lockKey);
    }
  }

  @Post(":id/close")
  @HttpCode(200)
  async closeRun(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    const lockKey = `${projectId || "mc-operator"}:${id}`;
    if (inFlightCloseLocks.has(lockKey)) {
      throw new HttpException(
        {
          msg: "Run close is already in flight.",
          reason: "single_flight_lock",
          nextCommand: "Wait for the existing close operation and retry.",
        },
        409,
      );
    }

    inFlightCloseLocks.add(lockKey);
    try {
      const run = await this.automationRunsService.closeRun({
        projectId,
        runId: id,
        archive: body.archive !== false,
        reason: parseCloseReason(body.reason),
      });

      return {
        msg:
          run?.status === "closing_pending_cleanup"
            ? "Workspace run close accepted; cleanup pending."
            : "Workspace run closed.",
        run,
      };
    } catch (error) {
      if (error instanceof WorkspaceRunError) {
        throw new HttpException(
          {
            msg: error.message,
            reason: error.reason,
            nextCommand: error.nextCommand,
            artifactPath: error.artifactPath,
          },
          error.status,
        );
      }
      throw error;
    } finally {
      inFlightCloseLocks.delete(lockKey);
    }
  }

  @Get(":id/summary")
  async runSummary(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    const summary = this.automationRunsService.getRunSummary({
      projectId,
      runId: id,
    });
    if (!summary) {
      throw new HttpException({ msg: "Workspace run not found." }, 404);
    }
    return summary;
  }
}
