import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { deleteSavedView } from "@/server/repositories/saved-views-repo";
import { badRequest, notFound, serverError } from "@/server/http/api-response";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) {
      return badRequest("Saved view ID is required.");
    }

    const deleted = deleteSavedView(user.id, project.id, id);
    if (!deleted) {
      return notFound("Saved view not found.");
    }

    return NextResponse.json({ msg: "Saved view deleted." });
  } catch (error) {
    return serverError(error, "Delete saved view error", "Failed to delete saved view.");
  }
}
