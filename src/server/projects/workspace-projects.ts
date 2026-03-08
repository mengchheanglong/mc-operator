import fs from "fs";
import path from "path";

export interface WorkspaceProject {
  id: string;
  name: string;
  rootPath: string;
  relativePath: string;
  category: "root" | "projects" | "archive";
  isControlPlane: boolean;
  hasGit: boolean;
  hasPackageJson: boolean;
}

type PackageJsonLike = {
  name?: string;
};

const IGNORED_ROOT_NAMES = new Set([
  ".git",
  ".openclaw",
  "memory",
  "node_modules",
  ".next",
]);

function workspaceRootPath() {
  return process.env.OPENCLAW_WORKSPACE_ROOT
    ? path.resolve(process.env.OPENCLAW_WORKSPACE_ROOT)
    : path.resolve(process.cwd(), "..");
}

export function getWorkspaceRootPath() {
  return workspaceRootPath();
}

export function getControlPlaneProjectId() {
  return path.relative(workspaceRootPath(), process.cwd()).replace(/\\/g, "/");
}

function normalizeRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, "/").replace(/^\.\/+/, "").trim();
}

function humanizeProjectName(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function pathExists(targetPath: string) {
  return fs.existsSync(targetPath);
}

function readPackageJson(rootPath: string): PackageJsonLike {
  const packagePath = path.join(rootPath, "package.json");
  if (!pathExists(packagePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageJsonLike;
  } catch {
    return {};
  }
}

function isProjectDirectory(rootPath: string) {
  return (
    pathExists(path.join(rootPath, ".git")) ||
    pathExists(path.join(rootPath, "package.json")) ||
    pathExists(path.join(rootPath, "src")) ||
    pathExists(path.join(rootPath, "README.md")) ||
    pathExists(path.join(rootPath, "pyproject.toml")) ||
    pathExists(path.join(rootPath, "Cargo.toml")) ||
    pathExists(path.join(rootPath, "go.mod"))
  );
}

function createProjectRecord(
  rootPath: string,
  category: WorkspaceProject["category"],
): WorkspaceProject | null {
  if (!isProjectDirectory(rootPath)) {
    return null;
  }

  const root = workspaceRootPath();
  const relativePath = normalizeRelativePath(path.relative(root, rootPath));
  if (!relativePath) {
    return null;
  }

  const packageJson = readPackageJson(rootPath);
  const folderName = path.basename(rootPath);
  const isControlPlane = path.resolve(rootPath) === path.resolve(process.cwd());

  return {
    id: relativePath,
    name: packageJson.name?.trim() || humanizeProjectName(folderName),
    rootPath,
    relativePath,
    category,
    isControlPlane,
    hasGit: pathExists(path.join(rootPath, ".git")),
    hasPackageJson: pathExists(path.join(rootPath, "package.json")),
  };
}

function collectRootProjects(root: string) {
  if (!pathExists(root)) {
    return [];
  }

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !IGNORED_ROOT_NAMES.has(entry.name))
    .map((entry) => createProjectRecord(path.join(root, entry.name), "root"))
    .filter(Boolean) as WorkspaceProject[];
}

function collectNestedProjects(root: string, containerName: "projects" | "archive") {
  const containerPath = path.join(root, containerName);
  if (!pathExists(containerPath)) {
    return [];
  }

  return fs
    .readdirSync(containerPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => createProjectRecord(path.join(containerPath, entry.name), containerName))
    .filter(Boolean) as WorkspaceProject[];
}

export function listWorkspaceProjects(): WorkspaceProject[] {
  const root = workspaceRootPath();
  const projects = [
    ...collectRootProjects(root),
    ...collectNestedProjects(root, "projects"),
    ...collectNestedProjects(root, "archive"),
  ];

  const seen = new Set<string>();
  const uniqueProjects = projects.filter((project) => {
    if (seen.has(project.id)) {
      return false;
    }

    seen.add(project.id);
    return true;
  });

  return uniqueProjects.sort((left, right) => {
    if (left.isControlPlane !== right.isControlPlane) {
      return left.isControlPlane ? -1 : 1;
    }

    if (left.category !== right.category) {
      if (left.category === "archive") return 1;
      if (right.category === "archive") return -1;
      if (left.category === "projects") return -1;
      if (right.category === "projects") return 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export function findWorkspaceProject(projectId?: string | null) {
  const normalizedId = normalizeRelativePath(projectId || "");
  const projects = listWorkspaceProjects();

  if (normalizedId) {
    const matched = projects.find((project) => project.id === normalizedId);
    if (matched) {
      return matched;
    }
  }

  return (
    projects.find((project) => project.isControlPlane) ||
    projects[0] ||
    createProjectRecord(process.cwd(), "root")
  );
}

export function toProjectStorageSlug(projectId: string) {
  return projectId.replace(/[\\/]/g, "__").replace(/[^a-zA-Z0-9._-]/g, "-");
}
