import { NextResponse } from "next/server";
import { resolveUserContext } from "@/server/context/user-context";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { serverError } from "@/server/http/api-response";
import { createRun, WorkspaceRunError } from "@/server/services/workspace-run-service";

export const dynamic = "force-dynamic";

const inFlightCreateLocks = new Set<string>();

export async function POST(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const body = await req.json();
    const branch = String(body.branch || "").trim();

    const lockKey = `${user.id}:${project.id}:${branch}`;
    if (inFlightCreateLocks.has(lockKey)) {
      return NextResponse.json(
        {
          msg: "Run creation is already in flight.",
          reason: "single_flight_lock",
          nextCommand: "Wait for current create operation to complete and retry.",
          artifactPath: `${project.rootPath}\\.openclaw\\runs`,
        },
        { status: 409 },
      );
    }

    inFlightCreateLocks.add(lockKey);
    try {
      const run = await createRun({
        userId: user.id,
        project,
        branch,
        metadata: typeof body.metadata === "object" && body.metadata ? body.metadata : {},
      });

      return NextResponse.json({ msg: "Workspace run created.", run });
    } finally {
      inFlightCreateLocks.delete(lockKey);
    }
  } catch (error) {
    if (error instanceof WorkspaceRunError) {
      return NextResponse.json(
        {
          msg: error.message,
          reason: error.reason,
          nextCommand: error.nextCommand,
          artifactPath: error.artifactPath,
        },
        { status: error.status },
      );
    }
    return serverError(error, "Create workspace run error", "Failed to create workspace run.");
  }
}
