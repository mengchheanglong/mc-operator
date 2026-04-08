import {
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AUTOMATION_TOKEN_HEADER,
  AutomationSessionBriefService,
} from "./automation-session-brief.service";

@Controller("api/v1/automation")
export class AutomationSessionBriefController {
  constructor(
    private readonly automationSessionBriefService: AutomationSessionBriefService,
  ) {}

  @Get("session-brief")
  sessionBrief(
    @Query("projectId") projectId?: string,
    @Query("focusType") focusType?: string,
    @Query("focusId") focusId?: string,
    @Query("tier") tier?: string,
    @Query("format") format?: string,
    @Headers(AUTOMATION_TOKEN_HEADER) tokenHeader?: string,
  ) {
    if (!this.automationSessionBriefService.validateAutomationToken(tokenHeader)) {
      throw new UnauthorizedException("Invalid automation token.");
    }

    const payload = this.automationSessionBriefService.buildSessionBrief({
      projectId,
      focusType,
      focusId,
      tier,
    });

    const normalizedFormat = String(format || "").trim().toLowerCase();
    if (normalizedFormat === "markdown") {
      return payload.promptPackMarkdown;
    }
    if (normalizedFormat === "handoff") {
      return payload.sessionHandoffMarkdown;
    }
    return payload;
  }
}
