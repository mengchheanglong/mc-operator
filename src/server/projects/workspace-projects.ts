import fs from "fs";
import path from "path";

export interface WorkspaceProject {
  id: string;
  name: string;
  rootPath: string;
  relativePath: string;
  category: "root" | "studyspace" | "projects" | "archive" | "tools";
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
  "projects",
  "archive",
  "templates",
  "tools",
  "scripts",
  "hooks",
  "logs",
]);

const GENERIC_PROJECT_FOLDER_NAMES = new Set([
  "app",
  "my-app",
  "frontend",
  "backend",
  "web",
  "site",
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

function resolveFolderDisplayName(rootPath: string) {
  const folderName = path.basename(rootPath);
  if (!GENERIC_PROJECT_FOLDER_NAMES.has(folderName.toLowerCase())) {
    return humanizeProjectName(folderName);
  }

  const parentName = path.basename(path.dirname(rootPath));
  return humanizeProjectName(parentName);
}

function normalizeProjectToken(value: string) {
  return value.trim().toLowerCase().replace(/[-_\s]+/g, "");
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

function hasTopLevelPythonFile(rootPath: string) {
  try {
    return fs
      .readdirSync(rootPath, { withFileTypes: true })
      .some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".py"));
  } catch {
    return false;
  }
}

function hasStrongProjectSignals(rootPath: string) {
  return (
    pathExists(path.join(rootPath, "package.json")) ||
    pathExists(path.join(rootPath, "src")) ||
    pathExists(path.join(rootPath, "pyproject.toml")) ||
    pathExists(path.join(rootPath, "requirements.txt")) ||
    pathExists(path.join(rootPath, "Cargo.toml")) ||
    pathExists(path.join(rootPath, "go.mod")) ||
    hasTopLevelPythonFile(rootPath)
  );
}

function isProjectDirectory(rootPath: string) {
  return (
    pathExists(path.join(rootPath, ".git")) ||
    hasStrongProjectSignals(rootPath) ||
    pathExists(path.join(rootPath, "README.md")) ||
    pathExists(path.join(rootPath, ".git"))
  );
}

function resolveNestedProjectRoot(rootPath: string) {
  if (!pathExists(rootPath) || hasStrongProjectSignals(rootPath)) {
    return rootPath;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true });
  } catch {
    return rootPath;
  }

  const nestedCandidates = entries
    .filter((entry) => entry.isDirectory() && !IGNORED_ROOT_NAMES.has(entry.name))
    .map((entry) => path.join(rootPath, entry.name))
    .filter((candidatePath) => hasStrongProjectSignals(candidatePath));

  if (nestedCandidates.length === 1) {
    return nestedCandidates[0];
  }

  return rootPath;
}

function resolveProjectDisplayName(
  packageName: string | undefined,
  folderName: string,
  rootPath: string,
) {
  const normalizedFolder = normalizeProjectToken(folderName);
  const normalizedPackage = normalizeProjectToken(packageName || "");
  const fallbackName = resolveFolderDisplayName(rootPath);
  const isGenericFolder = GENERIC_PROJECT_FOLDER_NAMES.has(folderName.toLowerCase());

  if (!packageName?.trim()) {
    return fallbackName;
  }

  if (normalizedFolder === normalizedPackage) {
    if (isGenericFolder) {
      return fallbackName;
    }

    return packageName.trim();
  }

  return fallbackName;
}

function createProjectRecord(
  rootPath: string,
  category: WorkspaceProject["category"],
): WorkspaceProject | null {
  const resolvedRootPath = resolveNestedProjectRoot(rootPath);

  if (!isProjectDirectory(resolvedRootPath)) {
    return null;
  }

  const root = workspaceRootPath();
  const relativePath = normalizeRelativePath(path.relative(root, resolvedRootPath));
  if (!relativePath) {
    return null;
  }

  const packageJson = readPackageJson(resolvedRootPath);
  const folderName = path.basename(resolvedRootPath);
  const isControlPlane =
    path.resolve(resolvedRootPath) === path.resolve(process.cwd());

  return {
    id: relativePath,
    name: resolveProjectDisplayName(packageJson.name, folderName, resolvedRootPath),
    rootPath: resolvedRootPath,
    relativePath,
    category,
    isControlPlane,
    hasGit: pathExists(path.join(resolvedRootPath, ".git")),
    hasPackageJson: pathExists(path.join(resolvedRootPath, "package.json")),
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
    .map((entry) =>
      createProjectRecord(
        path.join(root, entry.name),
        entry.name.toLowerCase() === "studyspace" ? "studyspace" : "root",
      ),
    )
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

function collectOptionalNestedProjects(root: string, containerName: "archive" | "tools") {
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
      if (left.category === "studyspace") return -1;
      if (right.category === "studyspace") return 1;
      if (left.category === "projects") return -1;
      if (right.category === "projects") return 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export function listWorkspaceGraphProjects(): WorkspaceProject[] {
  const root = workspaceRootPath();
  const projects = [
    ...collectRootProjects(root),
    ...collectNestedProjects(root, "projects"),
    ...collectOptionalNestedProjects(root, "archive"),
    ...collectOptionalNestedProjects(root, "tools"),
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

    const categoryOrder = { root: 0, studyspace: 1, projects: 2, tools: 3, archive: 4 } as const;
    const orderDiff = categoryOrder[left.category] - categoryOrder[right.category];
    if (orderDiff !== 0) {
      return orderDiff;
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

    const candidateRoot = path.join(workspaceRootPath(), normalizedId);
    if (pathExists(candidateRoot)) {
      const relativeCategory = normalizedId.split("/")[0];
      const category: WorkspaceProject["category"] =
        relativeCategory === "studyspace"
          ? "studyspace"
          : relativeCategory === "projects"
            ? "projects"
            : relativeCategory === "archive"
              ? "archive"
              : relativeCategory === "tools"
                ? "tools"
                : "root";
      const resolved = createProjectRecord(candidateRoot, category);
      if (resolved) {
        return resolved;
      }
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
