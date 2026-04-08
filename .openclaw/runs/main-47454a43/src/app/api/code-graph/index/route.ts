import { NextRequest, NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { indexProjectWithCodeGraphContext } from "@/server/services/workspace-intel-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const project = resolveProjectFromRequest(req);
    const result = indexProjectWithCodeGraphContext(project);

    return NextResponse.json(
      {
        success: result.success,
        message: result.message,
        output: result.output,
      },
      { status: result.success ? 200 : 400 },
    );
  } catch (error) {
    console.error("CodeGraphContext index error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to run CodeGraphContext indexing for the active project.",
      },
      { status: 500 },
    );
  }
}
