import { NextResponse } from "next/server";
import { resolveUserContext } from "@/server/context/user-context";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { serverError } from "@/server/http/api-response";
import { closeRun, WorkspaceRunError } from "@/server/services/workspace-run-service";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const inFlightCloseLocks = new Set<string>();

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const lockKey = `${user.id}:${project.id}:${id}`;
    if (inFlightCloseLocks.has(lockKey)) {
      return NextResponse.json(
        {
          msg: "Run close is already in flight.",
          reason: "single_flight_lock",
          nextCommand: "Wait for the existing close operation and retry.",
          artifactPath: `${project.rootPath}\\.openclaw\\runs`,
        },
        { status: 409 },
      );
    }

    inFlightCloseLocks.add(lockKey);
    try {
      const run = await closeRun({
        userId: user.id,
        project,
        runId: id,
        archive: body.archive !== false,
      });
      return NextResponse.json({ msg: "Workspace run closed.", run });
    } finally {
      inFlightCloseLocks.delete(lockKey);
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
    return serverError(error, "Close workspace run error", "Failed to close workspace run.");
  }
}
