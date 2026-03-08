import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  findWorkspaceProject,
  listWorkspaceProjects,
  type WorkspaceProject,
} from "@/server/projects/workspace-projects";

export const ACTIVE_PROJECT_COOKIE = "openclaw_active_project";

function decodeCookieValue(value?: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) {
    return undefined;
  }

  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACTIVE_PROJECT_COOKIE}=`));

  if (!match) {
    return undefined;
  }

  return decodeCookieValue(match.split("=").slice(1).join("="));
}

export function serializeProjectCookieValue(projectId: string) {
  return encodeURIComponent(projectId);
}

export function listAvailableProjects() {
  return listWorkspaceProjects();
}

export function resolveProjectById(projectId?: string | null): WorkspaceProject {
  return findWorkspaceProject(projectId) as WorkspaceProject;
}

export function resolveProjectFromRequest(req: Request | NextRequest) {
  const url = new URL(req.url);
  const requestProjectId =
    url.searchParams.get("projectId") ||
    req.headers.get("x-openclaw-project") ||
    parseCookieHeader(req.headers.get("cookie"));

  return resolveProjectById(requestProjectId);
}

export async function resolveProjectContext() {
  const cookieStore = await cookies();
  const projectId = decodeCookieValue(cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value);
  return resolveProjectById(projectId);
}
