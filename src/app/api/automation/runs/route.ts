import { NextResponse } from "next/server";
import { resolveUserContext } from "@/server/context/user-context";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { serverError } from "@/server/http/api-response";
import { detectStaleRuns, listRuns } from "@/server/services/workspace-run-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const runs = listRuns({ userId: user.id, projectId: project.id });
    const staleRuns = detectStaleRuns({ userId: user.id, projectId: project.id }).map((row) => row.id);
    return NextResponse.json({ runs, staleRuns });
  } catch (error) {
    return serverError(error, "List workspace runs error", "Failed to list workspace runs.");
  }
}
