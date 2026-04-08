import { NextRequest, NextResponse } from "next/server";
import {
  resolveProjectFromRequest,
} from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import {
  renderContextPackMarkdown,
  renderSessionHandoffMarkdown,
  writeDashboardContextFiles,
  writeFocusedContextFile,
} from "@/server/services/workspace-context-writer";
import {
  AUTOMATION_TOKEN_HEADER,
  requireAutomationToken,
} from "@/server/http/automation-auth";
import type { ContextFocusType, ContextTier } from "@/types/context-pack";

export const dynamic = "force-dynamic";

const VALID_FOCUS_TYPES = new Set<ContextFocusType>([
  "workspace",
  "quest_focus",
  "doc_focus",
  "graph_focus",
]);

const VALID_TIERS = new Set<ContextTier>(["summary", "overview", "full"]);

export async function GET(req: NextRequest) {
  const authError = requireAutomationToken(req);
  if (authError) {
    return authError;
  }

  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const url = new URL(req.url);
    const rawFocusType = url.searchParams.get("focusType") || "workspace";
    const focusType = VALID_FOCUS_TYPES.has(rawFocusType as ContextFocusType)
      ? (rawFocusType as ContextFocusType)
      : "workspace";
    const focusId = url.searchParams.get("focusId") || undefined;
    const rawTier = url.searchParams.get("tier") || "overview";
    const tier = VALID_TIERS.has(rawTier as ContextTier)
      ? (rawTier as ContextTier)
      : "overview";
    const format = (url.searchParams.get("format") || "json").toLowerCase();

    await writeDashboardContextFiles(user.id, project);
    const pack = await writeFocusedContextFile(
      user.id,
      project,
      focusType,
      focusId,
      tier,
    );
    const promptPackMarkdown = renderContextPackMarkdown(pack);
    const sessionHandoffMarkdown = renderSessionHandoffMarkdown(pack);

    if (format === "markdown") {
      return new Response(promptPackMarkdown, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
        },
      });
    }

    if (format === "handoff") {
      return new Response(sessionHandoffMarkdown, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
        },
      });
    }

    return NextResponse.json({
      success: true,
      pack,
      promptPackMarkdown,
      sessionHandoffMarkdown,
      automation: {
        tokenHeader: AUTOMATION_TOKEN_HEADER,
        questEndpoint: "/api/automation/quests",
        reportEndpoint: "/api/automation/reports",
        supportedTiers: Array.from(VALID_TIERS),
        projectSelector: "projectId query param or x-openclaw-project header",
      },
    });
  } catch (error) {
    console.error("Automation Session Brief Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build automation session brief." },
      { status: 500 },
    );
  }
}
