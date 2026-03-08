import { NextResponse } from "next/server";
import {
  listAvailableProjects,
  resolveProjectFromRequest,
} from "@/server/context/project-context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const activeProject = resolveProjectFromRequest(req);
  const projects = listAvailableProjects().map((project) => ({
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
      relativePath: activeProject.relativePath,
      category: activeProject.category,
      isControlPlane: activeProject.isControlPlane,
      hasGit: activeProject.hasGit,
      hasPackageJson: activeProject.hasPackageJson,
    },
    projects,
  });
}
