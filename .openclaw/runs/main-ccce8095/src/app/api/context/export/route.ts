import { NextRequest, NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { writeDashboardContextFiles, writeFocusedContextFile } from "@/server/services/workspace-context-writer";
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

    await writeDashboardContextFiles(user.id, project);
    const pack =
      focusType === "workspace"
        ? await writeFocusedContextFile(user.id, project, "workspace", undefined, tier)
        : await writeFocusedContextFile(user.id, project, focusType, focusId, tier);

    return NextResponse.json({ success: true, pack });
  } catch (error) {
    console.error("Context Pack Export Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build context pack" },
      { status: 500 }
    );
  }
}
