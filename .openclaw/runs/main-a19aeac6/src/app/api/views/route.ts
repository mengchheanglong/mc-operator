import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import {
  createSavedView,
  listSavedViews,
  type SavedViewSurface,
} from "@/server/repositories/saved-views-repo";
import { badRequest, serverError } from "@/server/http/api-response";

export const dynamic = "force-dynamic";

interface CreateSavedViewPayload {
  surface?: SavedViewSurface;
  name?: string;
  filters?: Record<string, unknown>;
}

function normalizeSurface(value: string | null | undefined) {
  return value === "quests" || value === "reports" ? value : null;
}

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { searchParams } = new URL(req.url);
    const surface = normalizeSurface(searchParams.get("surface"));

    if (!surface) {
      return badRequest("Surface is required.");
    }

    return NextResponse.json({
      views: listSavedViews(user.id, project.id, surface),
    });
  } catch (error) {
    return serverError(error, "Fetch saved views error", "Failed to fetch saved views.");
  }
}

export async function POST(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const body = (await req.json()) as CreateSavedViewPayload;
    const surface = normalizeSurface(body.surface);
    const name = String(body.name || "").trim();
    const filters =
      body.filters && typeof body.filters === "object" && !Array.isArray(body.filters)
        ? body.filters
        : {};

    if (!surface) {
      return badRequest("Surface is required.");
    }

    if (!name) {
      return badRequest("View name is required.");
    }

    return NextResponse.json({
      msg: "Saved view created.",
      view: createSavedView(user.id, project.id, surface, name, filters),
    });
  } catch (error) {
    return serverError(error, "Create saved view error", "Failed to create saved view.");
  }
}
