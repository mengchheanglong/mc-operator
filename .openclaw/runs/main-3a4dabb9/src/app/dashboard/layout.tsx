import DashboardLayoutClient from "./DashboardLayoutClient";
import { listAvailableProjects, resolveProjectContext } from "@/server/context/project-context";
import type { ProjectsPayload } from "@/types/projects";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const activeProject = await resolveProjectContext();
  const projects = listAvailableProjects().map((project) => ({
    id: project.id,
    name: project.name,
    relativePath: project.relativePath,
    category: project.category,
    isControlPlane: project.isControlPlane,
    hasGit: project.hasGit,
    hasPackageJson: project.hasPackageJson,
  }));

  const initialProjectsPayload: ProjectsPayload = {
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
  };

  return (
    <DashboardLayoutClient initialProjectsPayload={initialProjectsPayload}>
      {children}
    </DashboardLayoutClient>
  );
}
