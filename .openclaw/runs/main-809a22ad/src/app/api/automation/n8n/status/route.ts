import { NextRequest, NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { buildN8nAutomationSnapshot } from "@/server/services/n8n-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const project = resolveProjectFromRequest(req);
    const snapshot = await buildN8nAutomationSnapshot(project);

    return NextResponse.json({
      success: true,
      automation: snapshot,
    });
  } catch (error) {
    console.error("n8n status error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to inspect n8n status." },
      { status: 500 },
    );
  }
}
