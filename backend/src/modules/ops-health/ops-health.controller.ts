import { Controller, Get, Query } from "@nestjs/common";
import { OpsHealthService } from "./ops-health.service";

@Controller("api/v1/ops/health")
export class OpsHealthController {
  constructor(private readonly opsHealthService: OpsHealthService) {}

  @Get()
  readOpsHealth(
    @Query("projectId") projectId?: string,
    @Query("view") view?: string,
  ) {
    const snapshot = this.opsHealthService.readSnapshot(
      String(projectId || "").trim() || "mission-control",
      30,
    );

    if (String(view || "").trim() === "failing") {
      const failing = Object.values(snapshot.items).filter(
        (item) => !(item.available && item.ok === true && item.stale === false),
      );
      return {
        ok: failing.length === 0,
        generatedAt: snapshot.generatedAt,
        overallOk: snapshot.overallOk,
        maxAgeHours: snapshot.maxAgeHours,
        failingCount: failing.length,
        failing,
      };
    }

    return {
      ok: snapshot.overallOk === true,
      ...snapshot,
    };
  }
}
