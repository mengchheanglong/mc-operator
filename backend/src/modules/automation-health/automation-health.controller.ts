import {
  Controller,
  Get,
  HttpException,
  Query,
} from "@nestjs/common";
import { AutomationHealthService } from "./automation-health.service";

const DEFAULT_PROJECT_ID = "mission-control";

@Controller("api/v1/automation")
export class AutomationHealthController {
  constructor(private readonly automationHealthService: AutomationHealthService) {}

  @Get("openclaw/health")
  async openclawHealth() {
    const result = await this.automationHealthService.getOpenClawHealth();
    if (result.statusCode !== 200) {
      throw new HttpException(result.payload, result.statusCode);
    }
    return result.payload;
  }

  @Get("n8n/status")
  async n8nStatus(@Query("projectId") projectId?: string) {
    const result = await this.automationHealthService.getN8nStatus(
      String(projectId || "").trim() || DEFAULT_PROJECT_ID,
    );
    if (result.statusCode !== 200) {
      throw new HttpException(result.payload, result.statusCode);
    }
    return result.payload;
  }
}
