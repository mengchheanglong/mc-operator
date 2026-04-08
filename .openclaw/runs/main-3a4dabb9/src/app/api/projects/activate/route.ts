import { NextRequest, NextResponse } from "next/server";
import {
  ACTIVE_PROJECT_COOKIE,
  resolveProjectById,
  serializeProjectCookieValue,
} from "@/server/context/project-context";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const nextPath = url.searchParams.get("next") || "/dashboard";
  const project = resolveProjectById(projectId);

  const redirectUrl = new URL(nextPath, url.origin);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(ACTIVE_PROJECT_COOKIE, serializeProjectCookieValue(project.id), {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
