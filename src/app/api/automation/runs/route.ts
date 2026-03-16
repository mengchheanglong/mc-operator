import { NextResponse } from "next/server";
import { resolveUserContext } from "@/server/context/user-context";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { serverError } from "@/server/http/api-response";
import { listRuns } from "@/server/services/workspace-run-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const runs = listRuns({ userId: user.id, projectId: project.id });
    return NextResponse.json({ runs });
  } catch (error) {
    return serverError(error, "List workspace runs error", "Failed to list workspace runs.");
  }
}
