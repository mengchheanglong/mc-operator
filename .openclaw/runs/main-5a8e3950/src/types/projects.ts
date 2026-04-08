export interface ProjectOption {
  id: string;
  name: string;
  relativePath: string;
  category: "root" | "studyspace" | "projects" | "archive" | "tools";
  isControlPlane: boolean;
  hasGit: boolean;
  hasPackageJson: boolean;
}

export interface ProjectsPayload {
  activeProject: ProjectOption;
  projects: ProjectOption[];
}
