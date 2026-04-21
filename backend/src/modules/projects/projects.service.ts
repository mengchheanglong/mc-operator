import { BadRequestException, Injectable } from "@nestjs/common";
import fs from "node:fs";
import path from "node:path";
import { SqliteService } from "../../infra/sqlite/sqlite.service";
import { normalizeString, resolveOperator } from "../../infra/service-utils";

type WorkspaceProjectType = "personal" | "github" | "external";

interface WorkspaceProject {
  id: string;
  name: string;
  rootPath: string;
  relativePath: string;
  category: "root" | "studyspace" | "projects" | "archive" | "tools";
  isControlPlane: boolean;
  hasGit: boolean;
  hasPackageJson: boolean;
  projectType: WorkspaceProjectType;
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

const DEFAULT_PERSONAL_PROJECT_NAMES = [
  "mc-operator",
  "studyspace",
  "venturespace",
  "freshhaul-kh",
  "Business-Analytics-Backend",
];

@Injectable()
export class ProjectsService {
  constructor(private readonly sqlite: SqliteService) {}

  private s(value: unknown) {
    return normalizeString(value);
  }

  private operator() {
    return resolveOperator(this.sqlite.connection);
  }

  private pathExists(targetPath: string) {
    return fs.existsSync(targetPath);
  }

  private workspaceRootPath() {
    return process.env.OPENCLAW_WORKSPACE_ROOT
      ? path.resolve(process.env.OPENCLAW_WORKSPACE_ROOT)
      : path.resolve(process.cwd(), "..", "..");
  }

  private normalizeRelativePath(relativePath: string) {
    return relativePath.replace(/\\/g, "/").replace(/^\.\/+/, "").trim();
  }

  private humanizeProjectName(value: string) {
    return value
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private resolveFolderDisplayName(rootPath: string) {
    const folderName = path.basename(rootPath);
    if (!GENERIC_PROJECT_FOLDER_NAMES.has(folderName.toLowerCase())) {
      return this.humanizeProjectName(folderName);
    }

    const parentName = path.basename(path.dirname(rootPath));
    return this.humanizeProjectName(parentName);
  }

  private normalizeProjectToken(value: string) {
    return value.trim().toLowerCase().replace(/[-_\s]+/g, "");
  }

  private configuredPersonalProjectTokens() {
    const configuredProjects = String(
      process.env.MISSION_CONTROL_PERSONAL_PROJECTS || "",
    );
    const candidates = [
      ...DEFAULT_PERSONAL_PROJECT_NAMES,
      ...configuredProjects
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ];

    return new Set(candidates.map((value) => this.normalizeProjectToken(value)).filter(Boolean));
  }

  private collectProjectTokens(
    relativePath: string,
    folderName: string,
    displayName: string,
  ) {
    const rawTokens = [relativePath, folderName, displayName];
    return rawTokens
      .map((value) => this.normalizeProjectToken(value))
      .filter(Boolean);
  }

  private resolveGitDir(rootPath: string) {
    const gitPath = path.join(rootPath, ".git");
    if (!this.pathExists(gitPath)) {
      return null;
    }

    try {
      const gitStat = fs.statSync(gitPath);
      if (gitStat.isDirectory()) {
        return gitPath;
      }

      if (gitStat.isFile()) {
        const gitPointer = fs.readFileSync(gitPath, "utf8");
        const gitDirMatch = gitPointer.match(/^gitdir:\s*(.+)$/im);
        if (!gitDirMatch?.[1]) {
          return null;
        }

        return path.resolve(rootPath, gitDirMatch[1].trim());
      }
    } catch {
      return null;
    }

    return null;
  }

  private readGitOriginUrl(rootPath: string) {
    const gitDir = this.resolveGitDir(rootPath);
    if (!gitDir) {
      return null;
    }

    const configPath = path.join(gitDir, "config");
    if (!this.pathExists(configPath)) {
      return null;
    }

    try {
      const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
      let inOriginSection = false;

      for (const line of lines) {
        const trimmedLine = line.trim();
        const remoteHeader = trimmedLine.match(/^\[remote\s+"(.+)"\]$/i);
        if (remoteHeader) {
          inOriginSection = remoteHeader[1].toLowerCase() === "origin";
          continue;
        }

        if (trimmedLine.startsWith("[") && !remoteHeader) {
          inOriginSection = false;
          continue;
        }

        if (!inOriginSection) {
          continue;
        }

        const urlMatch = trimmedLine.match(/^url\s*=\s*(.+)$/i);
        if (urlMatch?.[1]) {
          return urlMatch[1].trim();
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private isGitHubOriginUrl(originUrl: string | null) {
    if (!originUrl) {
      return false;
    }

    const normalizedUrl = originUrl.toLowerCase();
    return normalizedUrl.includes("github.com") || normalizedUrl.startsWith("git@github");
  }

  private resolveProjectType(input: {
    rootPath: string;
    relativePath: string;
    folderName: string;
    displayName: string;
    isControlPlane: boolean;
    hasGit: boolean;
  }): WorkspaceProjectType {
    if (input.isControlPlane) {
      return "personal";
    }

    const personalTokens = this.configuredPersonalProjectTokens();
    const projectTokens = this.collectProjectTokens(
      input.relativePath,
      input.folderName,
      input.displayName,
    );
    if (projectTokens.some((token) => personalTokens.has(token))) {
      return "personal";
    }

    if (input.hasGit && this.isGitHubOriginUrl(this.readGitOriginUrl(input.rootPath))) {
      return "github";
    }

    return "external";
  }

  private readPackageJson(rootPath: string): PackageJsonLike {
    const packagePath = path.join(rootPath, "package.json");
    if (!this.pathExists(packagePath)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageJsonLike;
    } catch {
      return {};
    }
  }

  private hasTopLevelPythonFile(rootPath: string) {
    try {
      return fs
        .readdirSync(rootPath, { withFileTypes: true })
        .some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".py"));
    } catch {
      return false;
    }
  }

  private hasStrongProjectSignals(rootPath: string) {
    return (
      this.pathExists(path.join(rootPath, "package.json")) ||
      this.pathExists(path.join(rootPath, "src")) ||
      this.pathExists(path.join(rootPath, "pyproject.toml")) ||
      this.pathExists(path.join(rootPath, "requirements.txt")) ||
      this.pathExists(path.join(rootPath, "Cargo.toml")) ||
      this.pathExists(path.join(rootPath, "go.mod")) ||
      this.hasTopLevelPythonFile(rootPath)
    );
  }

  private isProjectDirectory(rootPath: string) {
    return (
      this.pathExists(path.join(rootPath, ".git")) ||
      this.hasStrongProjectSignals(rootPath) ||
      this.pathExists(path.join(rootPath, "README.md"))
    );
  }

  private resolveNestedProjectRoot(rootPath: string) {
    if (!this.pathExists(rootPath) || this.hasStrongProjectSignals(rootPath)) {
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
      .filter((candidatePath) => this.hasStrongProjectSignals(candidatePath));

    if (nestedCandidates.length === 1) {
      return nestedCandidates[0];
    }

    return rootPath;
  }

  private resolveProjectDisplayName(
    packageName: string | undefined,
    folderName: string,
    rootPath: string,
  ) {
    const normalizedFolder = this.normalizeProjectToken(folderName);
    const normalizedPackage = this.normalizeProjectToken(packageName || "");
    const fallbackName = this.resolveFolderDisplayName(rootPath);
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

  private createProjectRecord(
    rootPath: string,
    category: WorkspaceProject["category"],
  ): WorkspaceProject | null {
    const resolvedRootPath = this.resolveNestedProjectRoot(rootPath);

    if (!this.isProjectDirectory(resolvedRootPath)) {
      return null;
    }

    const root = this.workspaceRootPath();
    const relativePath = this.normalizeRelativePath(path.relative(root, resolvedRootPath));
    if (!relativePath) {
      return null;
    }

    const packageJson = this.readPackageJson(resolvedRootPath);
    const folderName = path.basename(resolvedRootPath);
    const projectName = this.resolveProjectDisplayName(
      packageJson.name,
      folderName,
      resolvedRootPath,
    );
    const isControlPlane =
      path.resolve(resolvedRootPath) === path.resolve(process.cwd(), "..");
    const hasGit = this.pathExists(path.join(resolvedRootPath, ".git"));
    const hasPackageJson = this.pathExists(path.join(resolvedRootPath, "package.json"));

    return {
      id: relativePath,
      name: projectName,
      rootPath: resolvedRootPath,
      relativePath,
      category,
      isControlPlane,
      hasGit,
      hasPackageJson,
      projectType: this.resolveProjectType({
        rootPath: resolvedRootPath,
        relativePath,
        folderName,
        displayName: projectName,
        isControlPlane,
        hasGit,
      }),
    };
  }

  private collectRootProjects(root: string) {
    if (!this.pathExists(root)) {
      return [];
    }

    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !IGNORED_ROOT_NAMES.has(entry.name))
      .map((entry) =>
        this.createProjectRecord(
          path.join(root, entry.name),
          entry.name.toLowerCase() === "studyspace" ? "studyspace" : "root",
        ),
      )
      .filter(Boolean) as WorkspaceProject[];
  }

  private collectNestedProjects(root: string, containerName: "projects" | "archive") {
    const containerPath = path.join(root, containerName);
    if (!this.pathExists(containerPath)) {
      return [];
    }

    return fs
      .readdirSync(containerPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        this.createProjectRecord(path.join(containerPath, entry.name), containerName),
      )
      .filter(Boolean) as WorkspaceProject[];
  }

  private collectPortfolioProjects(root: string) {
    if (!this.pathExists(root)) {
      return [];
    }

    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !IGNORED_ROOT_NAMES.has(entry.name))
      .flatMap((entry) => {
        const nestedProjectsPath = path.join(root, entry.name, "projects");
        if (!this.pathExists(nestedProjectsPath)) {
          return [];
        }

        return fs
          .readdirSync(nestedProjectsPath, { withFileTypes: true })
          .filter((child) => child.isDirectory())
          .map((child) =>
            this.createProjectRecord(path.join(nestedProjectsPath, child.name), "projects"),
          )
          .filter(Boolean) as WorkspaceProject[];
      });
  }

  private collectOptionalNestedProjects(root: string, containerName: "archive" | "tools") {
    const containerPath = path.join(root, containerName);
    if (!this.pathExists(containerPath)) {
      return [];
    }

    return fs
      .readdirSync(containerPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        this.createProjectRecord(path.join(containerPath, entry.name), containerName),
      )
      .filter(Boolean) as WorkspaceProject[];
  }

  private listWorkspaceProjects() {
    const root = this.workspaceRootPath();
    const projects = [
      ...this.collectRootProjects(root),
      ...this.collectPortfolioProjects(root),
      ...this.collectNestedProjects(root, "projects"),
      ...this.collectNestedProjects(root, "archive"),
    ];

    const seen = new Set<string>();
    const uniqueProjects = projects.filter((project) => {
      if (seen.has(project.id)) return false;
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

  private listWorkspaceGraphProjects() {
    const root = this.workspaceRootPath();
    const projects = [
      ...this.collectRootProjects(root),
      ...this.collectPortfolioProjects(root),
      ...this.collectNestedProjects(root, "projects"),
      ...this.collectOptionalNestedProjects(root, "archive"),
      ...this.collectOptionalNestedProjects(root, "tools"),
    ];

    const seen = new Set<string>();
    const uniqueProjects = projects.filter((project) => {
      if (seen.has(project.id)) return false;
      seen.add(project.id);
      return true;
    });

    return uniqueProjects.sort((left, right) => {
      if (left.isControlPlane !== right.isControlPlane) {
        return left.isControlPlane ? -1 : 1;
      }
      const categoryOrder = {
        root: 0,
        studyspace: 1,
        projects: 2,
        tools: 3,
        archive: 4,
      } as const;
      const orderDiff = categoryOrder[left.category] - categoryOrder[right.category];
      if (orderDiff !== 0) return orderDiff;
      return left.name.localeCompare(right.name);
    });
  }

  private listAvailableProjects() {
    const activeWorkspaceProjects = this.listWorkspaceProjects().filter((project) => {
      if (project.category === "archive" || project.category === "tools") return false;
      if (project.isControlPlane) return true;
      return project.projectType === "personal";
    });

    if (activeWorkspaceProjects.length > 0) {
      return activeWorkspaceProjects;
    }
    return this.listWorkspaceProjects();
  }

  private readActiveProjectId(userId: string) {
    const row = this.sqlite.connection
      .prepare("SELECT project_id FROM active_projects WHERE user_id = ? LIMIT 1")
      .get(userId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    const projectId = this.normalizeRelativePath(this.s(row.project_id));
    return projectId || null;
  }

  private setActiveProjectId(userId: string, projectId: string) {
    const now = new Date().toISOString();
    this.sqlite.connection
      .prepare(
        "INSERT INTO active_projects (user_id, project_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET project_id = excluded.project_id, updated_at = excluded.updated_at",
      )
      .run(userId, projectId, now);
  }

  private resolveActiveProject(input?: {
    projectId?: string | null;
    persistedProjectId?: string | null;
  }) {
    const availableProjects = this.listAvailableProjects();
    if (availableProjects.length === 0) {
      return null;
    }

    const normalizedProjectId = this.normalizeRelativePath(input?.projectId || "");
    const matched = availableProjects.find((project) => project.id === normalizedProjectId);
    if (matched) {
      return matched;
    }

    const persistedProjectId = this.normalizeRelativePath(input?.persistedProjectId || "");
    const persisted = availableProjects.find((project) => project.id === persistedProjectId);
    if (persisted) {
      return persisted;
    }

    return matched || availableProjects[0];
  }

  private serializeProject(project: WorkspaceProject) {
    return {
      id: project.id,
      name: project.name,
      relativePath: project.relativePath,
      category: project.category,
      isControlPlane: project.isControlPlane,
      hasGit: project.hasGit,
      hasPackageJson: project.hasPackageJson,
      projectType: project.projectType,
    };
  }

  list(projectId?: string | null) {
    const user = this.operator();
    const persistedProjectId = this.readActiveProjectId(user.id);
    const projects = this.listAvailableProjects().map((project) =>
      this.serializeProject(project),
    );
    const active = this.resolveActiveProject({
      projectId,
      persistedProjectId,
    });
    if (!active) return null;

    return {
      activeProject: this.serializeProject(active),
      projects,
    };
  }

  graph(projectId?: string | null) {
    const user = this.operator();
    const persistedProjectId = this.readActiveProjectId(user.id);
    const active = this.resolveActiveProject({
      projectId,
      persistedProjectId,
    });
    const projects = this.listWorkspaceGraphProjects()
      .filter((project) => !project.isControlPlane)
      .map((project) => this.serializeProject(project));

    if (!active) return null;

    return {
      activeProject: {
        id: active.id,
        name: active.name,
        isControlPlane: active.isControlPlane,
        projectType: active.projectType,
      },
      projects,
    };
  }

  active() {
    const user = this.operator();
    const persistedProjectId = this.readActiveProjectId(user.id);
    const active = this.resolveActiveProject({ persistedProjectId });
    if (!active) {
      return null;
    }

    if (active.id !== persistedProjectId) {
      this.setActiveProjectId(user.id, active.id);
    }

    return {
      activeProject: this.serializeProject(active),
    };
  }

  activate(projectId?: unknown) {
    const normalizedProjectId = this.normalizeRelativePath(this.s(projectId));
    if (!normalizedProjectId) {
      throw new BadRequestException("projectId is required.");
    }

    const availableProjects = this.listAvailableProjects();
    const active = availableProjects.find((project) => project.id === normalizedProjectId);
    if (!active) {
      throw new BadRequestException("Project is not available in this workspace.");
    }

    const user = this.operator();
    this.setActiveProjectId(user.id, active.id);

    return {
      activeProject: this.serializeProject(active),
    };
  }
}
