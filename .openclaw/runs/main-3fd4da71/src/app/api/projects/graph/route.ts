import { NextResponse } from "next/server";
import {
  listWorkspaceGraphProjects,
} from "@/server/projects/workspace-projects";
import { resolveProjectFromRequest } from "@/server/context/project-context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const activeProject = resolveProjectFromRequest(req);
  const projects = listWorkspaceGraphProjects()
    .filter((project) => !project.isControlPlane)
    .map((project) => ({
      id: project.id,
      name: project.name,
      relativePath: project.relativePath,
      category: project.category,
      isControlPlane: project.isControlPlane,
      hasGit: project.hasGit,
      hasPackageJson: project.hasPackageJson,
    }));

  return NextResponse.json({
    activeProject: {
      id: activeProject.id,
      name: activeProject.name,
      isControlPlane: activeProject.isControlPlane,
    },
    projects,
  });
}
