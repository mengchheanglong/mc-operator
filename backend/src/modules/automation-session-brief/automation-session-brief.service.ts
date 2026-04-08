import { Injectable } from "@nestjs/common";
import {
  ContextExportService,
  type ContextTier,
} from "../context-export/context-export.service";

export const AUTOMATION_TOKEN_HEADER = "x-openclaw-automation-token";

function normalizeUrl(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return normalized.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, pathname: string) {
  return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function buildMissionControlUrl(pathname: string) {
  const baseUrl = normalizeUrl(process.env.MISSION_CONTROL_BASE_URL);
  if (!baseUrl) return pathname;
  return joinUrl(baseUrl, pathname);
}

@Injectable()
export class AutomationSessionBriefService {
  constructor(private readonly contextExportService: ContextExportService) {}

  validateAutomationToken(token: unknown) {
    const expected = String(process.env.OPENCLAW_AUTOMATION_TOKEN || "").trim();
    if (!expected) {
      return true;
    }
    return String(token || "").trim() === expected;
  }

  buildSessionBrief(input: {
    projectId?: string;
    focusType?: string;
    focusId?: string;
    tier?: string;
  }) {
    const pack = this.contextExportService.buildContextPack({
      projectId: input.projectId,
      focusType: input.focusType,
      focusId: input.focusId,
      tier: input.tier,
    });
    const promptPackMarkdown =
      this.contextExportService.renderContextPackMarkdown(pack);
    const sessionHandoffMarkdown =
      this.contextExportService.renderSessionHandoffMarkdown(pack);
    const supportedTiers: ContextTier[] = ["summary", "overview", "full"];

    return {
      success: true,
      pack,
      promptPackMarkdown,
      sessionHandoffMarkdown,
      automation: {
        tokenHeader: AUTOMATION_TOKEN_HEADER,
        questEndpoint: "/api/automation/quests",
        reportEndpoint: "/api/automation/reports",
        supportedTiers,
        projectSelector: "projectId query param or x-openclaw-project header",
      },
      missionControl: {
        sessionBriefUrl: buildMissionControlUrl(
          `/api/automation/session-brief?projectId=${encodeURIComponent(pack.project.id)}`,
        ),
        reportUrl: buildMissionControlUrl("/api/automation/reports"),
      },
    };
  }
}
