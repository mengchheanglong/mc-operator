import { Controller, Get, Query } from "@nestjs/common";
import { OpsNightlyService } from "./ops-nightly.service";

@Controller("api/v1/ops")
export class OpsNightlyController {
  constructor(private readonly opsNightlyService: OpsNightlyService) {}

  @Get("nightly")
  readNightly(
    @Query("projectId") projectId?: string,
    @Query("view") view?: string,
    @Query("step") step?: string,
    @Query("flaggedOnly") flaggedOnly?: string,
    @Query("minSeverity") minSeverity?: string,
    @Query("limit") limit?: string,
  ) {
    return this.opsNightlyService.read({
      projectId,
      view,
      step,
      flaggedOnly,
      minSeverity,
      limit,
    });
  }
}
