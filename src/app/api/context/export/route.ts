import { NextRequest, NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { writeDashboardContextFiles, writeFocusedContextFile } from "@/server/services/workspace-context-writer";
import type { ContextFocusType } from "@/types/context-pack";

export const dynamic = "force-dynamic";

const VALID_FOCUS_TYPES = new Set<ContextFocusType>([
  "workspace",
  "quest_focus",
  "doc_focus",
  "graph_focus",
]);

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

    await writeDashboardContextFiles(user.id, project);
    const pack =
      focusType === "workspace"
        ? await writeFocusedContextFile(user.id, project, "workspace")
        : await writeFocusedContextFile(user.id, project, focusType, focusId);

    return NextResponse.json({ success: true, pack });
  } catch (error) {
    console.error("Context Pack Export Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build context pack" },
      { status: 500 }
    );
  }
}
