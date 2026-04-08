import { NextResponse } from "next/server";
import { resolveUserContext } from "@/server/context/user-context";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { serverError } from "@/server/http/api-response";
import { findWorkspaceRunById } from "@/server/repositories/workspace-runs-repo";
import { findLatestWorkspaceRunDispatch } from "@/server/repositories/workspace-run-dispatches-repo";
import { findReportById } from "@/server/repositories/reports-repo";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    const run = findWorkspaceRunById(user.id, project.id, id);
    if (!run) {
      return NextResponse.json({ msg: "Workspace run not found." }, { status: 404 });
    }

    const lastDispatch = findLatestWorkspaceRunDispatch(user.id, project.id, id);
    const report = lastDispatch?.reportId
      ? findReportById(user.id, project.id, lastDispatch.reportId)
      : undefined;

    return NextResponse.json({
      run,
      summary: {
        lastDispatch,
        verificationArtifacts: {
          reportId: report?.id || null,
          reportHref: report?.date ? `/dashboard/report?day=${encodeURIComponent(report.date.slice(0, 10))}` : null,
          lastCommandStatus: lastDispatch?.status || null,
          artifactPath: lastDispatch?.artifactPath || null,
        },
      },
    });
  } catch (error) {
    return serverError(error, "Workspace run summary error", "Failed to load workspace run summary.");
  }
}
