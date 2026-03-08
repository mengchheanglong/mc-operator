import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { extractLinks, normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import { listDocs } from "@/server/repositories/docs-repo";
import { listQuests } from "@/server/repositories/quests-repo";
import { listReports } from "@/server/repositories/reports-repo";
import type { WorkspaceProject } from "@/server/projects/workspace-projects";

type PackageJsonLike = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type RepoCodeIntelOverrideEntry = {
  language?: string;
  server?: string;
  status?: string;
  detail?: string;
  configSignals?: string[];
  runtimeSignals?: string[];
};

type RepoCodeIntelOverrideFile = {
  codeIntel?: {
    summary?: string;
    notes?: string[];
    suggestions?: string[];
    tools?: RepoCodeIntelOverrideEntry[];
  };
};

export interface RepoKeyFile {
  label: string;
  path: string;
  detail: string;
}

export interface RepoScript {
  name: string;
  command: string;
}

export interface RepoVerificationPreset {
  kind: "lint" | "typecheck" | "test" | "build" | "dev" | "custom";
  label: string;
  command: string;
}

export interface RepoHotspot {
  path: string;
  reason: string;
}

export interface GitFileChange {
  path: string;
  status: string;
}

export interface GitCommitSummary {
  hash: string;
  subject: string;
  date: string;
}

export interface GitSnapshot {
  available: boolean;
  branch: string | null;
  summary: string;
  isDirty: boolean;
  changedFiles: GitFileChange[];
  stagedCount: number;
  modifiedCount: number;
  untrackedCount: number;
  recentCommits: GitCommitSummary[];
  aheadCount: number;
  behindCount: number;
}

export type RepoCodeIntelStatus = "ready" | "partial" | "missing";

export interface RepoCodeIntelTool {
  language: string;
  server: string;
  status: RepoCodeIntelStatus;
  source: "auto" | "override";
  configSignals: string[];
  runtimeSignals: string[];
  detail: string;
}

export interface RepoCodeIntelSnapshot {
  overallStatus: RepoCodeIntelStatus;
  summary: string;
  tools: RepoCodeIntelTool[];
  suggestions: string[];
  notes: string[];
  overrideFilePath: string;
  hasOverrides: boolean;
  overrideError: string | null;
}

export interface RepoSnapshot {
  project: {
    id: string;
    name: string;
    relativePath: string;
    category: WorkspaceProject["category"];
  };
  summary: string;
  stack: string[];
  scripts: RepoScript[];
  verificationPresets: RepoVerificationPreset[];
  dashboardSurfaces: string[];
  apiRoutes: string[];
  workspaceAreas: string[];
  keyFiles: RepoKeyFile[];
  hotspots: RepoHotspot[];
  codeIntel: RepoCodeIntelSnapshot;
  git: GitSnapshot;
}

export interface CollaborationGuide {
  workflow: string[];
  updateRules: string[];
  nextInputs: string[];
}

export interface WorkspaceReadinessCheck {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
  href: string;
}

export interface WorkspaceReadiness {
  score: number;
  status: "seed" | "partial" | "ready";
  summary: string;
  checks: WorkspaceReadinessCheck[];
}

export interface BootstrapTemplate {
  title: string;
  tags: string[];
  content: string;
  matchKeywords: string[];
}

function repoPath(project: WorkspaceProject, ...segments: string[]) {
  return path.join(project.rootPath, ...segments);
}

function toRepoRelativePath(project: WorkspaceProject, absolutePath: string) {
  return path.relative(project.rootPath, absolutePath).replace(/\\/g, "/");
}

function pathExists(targetPath: string) {
  return fs.existsSync(targetPath);
}

const commandExistsCache = new Map<string, boolean>();

function commandExists(commandName: string) {
  const cacheKey = `${process.platform}:${commandName}`;
  const cached = commandExistsCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const locator = process.platform === "win32" ? "where.exe" : "which";
  let exists = false;

  try {
    execFileSync(locator, [commandName], {
      stdio: "ignore",
    });
    exists = true;
  } catch {
    exists = false;
  }

  commandExistsCache.set(cacheKey, exists);
  return exists;
}

function readTextIfExists(targetPath: string) {
  if (!pathExists(targetPath)) {
    return "";
  }

  try {
    return fs.readFileSync(targetPath, "utf8");
  } catch {
    return "";
  }
}

function collectDependencies(pkg: PackageJsonLike) {
  return {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
}

function hasAnyDependency(
  dependencies: Record<string, string>,
  packageNames: string[],
) {
  return packageNames.some((packageName) => Boolean(dependencies[packageName]));
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeCodeIntelStatus(value: unknown): RepoCodeIntelStatus {
  switch (String(value || "").trim().toLowerCase()) {
    case "ready":
    case "partial":
    case "missing":
      return String(value).trim().toLowerCase() as RepoCodeIntelStatus;
    default:
      return "partial";
  }
}

function readPackageJson(project: WorkspaceProject): PackageJsonLike {
  const packagePath = repoPath(project, "package.json");
  if (!pathExists(packagePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageJsonLike;
  } catch {
    return {};
  }
}

function getContextDir(project: WorkspaceProject) {
  return path.join(project.rootPath, ".openclaw", "context");
}

function humanizeSegment(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function listDirectoryNames(targetPath: string) {
  if (!pathExists(targetPath)) {
    return [];
  }

  return fs
    .readdirSync(targetPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function detectStack(project: WorkspaceProject, pkg: PackageJsonLike) {
  const dependencies = collectDependencies(pkg);
  const stack: string[] = [];

  if (dependencies.next) stack.push("Next.js");
  if (dependencies.react) stack.push("React");
  if (pathExists(repoPath(project, "tsconfig.json"))) stack.push("TypeScript");
  if (dependencies["drizzle-orm"]) stack.push("Drizzle ORM");
  if (dependencies["better-sqlite3"]) stack.push("SQLite");
  if (dependencies["gray-matter"]) stack.push("Markdown Knowledge Base");
  if (pathExists(repoPath(project, "pyproject.toml"))) stack.push("Python");
  if (pathExists(repoPath(project, "go.mod"))) stack.push("Go");
  if (pathExists(repoPath(project, "Cargo.toml"))) stack.push("Rust");

  return stack;
}

function collectScripts(pkg: PackageJsonLike): RepoScript[] {
  const scriptEntries = Object.entries(pkg.scripts || {});
  const preferredOrder = [
    "dev",
    "lint",
    "typecheck",
    "test",
    "build",
    "start",
    "db:generate",
    "db:migrate",
  ];

  const ordered = preferredOrder
    .map((name) => scriptEntries.find(([scriptName]) => scriptName === name))
    .filter(Boolean) as Array<[string, string]>;
  const remaining = scriptEntries.filter(
    ([name]) => !preferredOrder.includes(name),
  );

  return [...ordered, ...remaining]
    .slice(0, 10)
    .map(([name, command]) => ({ name, command }));
}

function collectVerificationPresets(
  project: WorkspaceProject,
  pkg: PackageJsonLike,
): RepoVerificationPreset[] {
  const presets: RepoVerificationPreset[] = [];
  const scriptMap = pkg.scripts || {};

  const preferredScriptKinds: Array<{
    kind: RepoVerificationPreset["kind"];
    label: string;
    scriptName: string;
  }> = [
    { kind: "lint", label: "Lint", scriptName: "lint" },
    { kind: "typecheck", label: "Typecheck", scriptName: "typecheck" },
    { kind: "test", label: "Test", scriptName: "test" },
    { kind: "build", label: "Build", scriptName: "build" },
    { kind: "dev", label: "Dev", scriptName: "dev" },
  ];

  for (const preset of preferredScriptKinds) {
    const command = scriptMap[preset.scriptName];
    if (command) {
      presets.push({
        kind: preset.kind,
        label: preset.label,
        command: `npm run ${preset.scriptName}`,
      });
    }
  }

  if (presets.length > 0) {
    return presets;
  }

  if (pathExists(repoPath(project, "pyproject.toml"))) {
    return [
      { kind: "test", label: "Pytest", command: "pytest" },
      { kind: "custom", label: "Ruff", command: "ruff check ." },
    ];
  }

  if (pathExists(repoPath(project, "Cargo.toml"))) {
    return [
      { kind: "typecheck", label: "Cargo Check", command: "cargo check" },
      { kind: "test", label: "Cargo Test", command: "cargo test" },
      { kind: "build", label: "Cargo Build", command: "cargo build" },
    ];
  }

  if (pathExists(repoPath(project, "go.mod"))) {
    return [
      { kind: "test", label: "Go Test", command: "go test ./..." },
      { kind: "build", label: "Go Build", command: "go build ./..." },
    ];
  }

  return [];
}

function collectDashboardSurfaces(project: WorkspaceProject) {
  return listDirectoryNames(repoPath(project, "src", "app", "dashboard"))
    .filter((name) => name !== "chat")
    .map(humanizeSegment);
}

function collectApiRoutes(project: WorkspaceProject, basePath = repoPath(project, "src", "app", "api")): string[] {
  if (!pathExists(basePath)) {
    return [];
  }

  const routes: string[] = [];

  function walk(currentPath: string, segments: string[]) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(currentPath, entry.name), [...segments, entry.name]);
      } else if (entry.isFile() && entry.name === "route.ts") {
        routes.push(`/${segments.join("/")}`);
      }
    }
  }

  walk(basePath, []);
  return routes.sort((left, right) => left.localeCompare(right));
}

function collectWorkspaceAreas(project: WorkspaceProject) {
  const candidates = [
    "src",
    "src/app",
    "src/server",
    "src/lib",
    "knowledge",
    ".openclaw/context",
    "drizzle",
    "tests",
  ];

  return candidates.filter((candidate) => pathExists(repoPath(project, candidate)));
}

function collectKeyFiles(project: WorkspaceProject): RepoKeyFile[] {
  const candidates: RepoKeyFile[] = [
    {
      label: "Package Manifest",
      path: "package.json",
      detail: "Scripts and runtime dependencies.",
    },
    {
      label: "README",
      path: "README.md",
      detail: "Top-level project intent and setup steps.",
    },
    {
      label: "TypeScript Config",
      path: "tsconfig.json",
      detail: "Compiler options and path aliases.",
    },
    {
      label: "Next Config",
      path: "next.config.js",
      detail: "Next.js build and runtime behavior.",
    },
    {
      label: "Pyproject",
      path: "pyproject.toml",
      detail: "Python dependencies and toolchain configuration.",
    },
    {
      label: "Cargo Manifest",
      path: "Cargo.toml",
      detail: "Rust crate definition and dependencies.",
    },
    {
      label: "Go Module",
      path: "go.mod",
      detail: "Go module boundary and dependency graph.",
    },
    {
      label: "Project Intelligence Overrides",
      path: ".openclaw/project-intel.json",
      detail: "Per-project overrides for semantic tooling and code-intelligence setup.",
    },
    {
      label: "App Entry",
      path: "src/app/layout.tsx",
      detail: "Top-level application shell and metadata.",
    },
    {
      label: "Main Entry",
      path: "src/main.ts",
      detail: "Client bootstrap entrypoint.",
    },
  ];

  return candidates.filter((entry) => pathExists(repoPath(project, entry.path)));
}

function collectHotspots(project: WorkspaceProject, keyFiles: RepoKeyFile[]): RepoHotspot[] {
  return keyFiles.slice(0, 5).map((file) => ({
    path: file.path,
    reason: file.detail,
  }));
}

export function getCodeIntelOverridePath(project: WorkspaceProject) {
  return repoPath(project, ".openclaw", "project-intel.json");
}

function readCodeIntelOverrides(project: WorkspaceProject) {
  const overridePath = getCodeIntelOverridePath(project);
  const overrideFilePath = toRepoRelativePath(project, overridePath);
  const hasOverrides = pathExists(overridePath);

  if (!hasOverrides) {
    return {
      summary: undefined as string | undefined,
      notes: [] as string[],
      suggestions: [] as string[],
      tools: [] as RepoCodeIntelTool[],
      overrideFilePath,
      hasOverrides: false,
      overrideError: null as string | null,
    };
  }

  try {
    const parsed = JSON.parse(
      readTextIfExists(overridePath) || "{}",
    ) as RepoCodeIntelOverrideFile;
    const codeIntel = parsed.codeIntel || {};
    const tools = Array.isArray(codeIntel.tools)
      ? codeIntel.tools
          .map((tool): RepoCodeIntelTool | null => {
            const language = String(tool.language || "").trim();
            const server = String(tool.server || "").trim();

            if (!language || !server) {
              return null;
            }

            const runtimeSignals = normalizeStringArray(tool.runtimeSignals);

            return {
              language,
              server,
              status: normalizeCodeIntelStatus(tool.status),
              source: "override",
              configSignals: normalizeStringArray(tool.configSignals),
              runtimeSignals,
              detail:
                String(tool.detail || "").trim() ||
                (runtimeSignals.length > 0
                  ? "Project override declares this language-server setup as available."
                  : "Project override documents a custom code-intelligence setup."),
            };
          })
          .filter(Boolean) as RepoCodeIntelTool[]
      : [];

    return {
      summary:
        typeof codeIntel.summary === "string" && codeIntel.summary.trim()
          ? codeIntel.summary.trim()
          : undefined,
      notes: normalizeStringArray(codeIntel.notes),
      suggestions: normalizeStringArray(codeIntel.suggestions),
      tools,
      overrideFilePath,
      hasOverrides: true,
      overrideError: null as string | null,
    };
  } catch (error) {
    return {
      summary: undefined as string | undefined,
      notes: [] as string[],
      suggestions: [] as string[],
      tools: [] as RepoCodeIntelTool[],
      overrideFilePath,
      hasOverrides: true,
      overrideError:
        error instanceof Error
          ? error.message
          : "Invalid JSON in project-intel override file.",
    };
  }
}

export function buildCodeIntelOverrideTemplate(snapshot: RepoSnapshot) {
  const defaultTools = snapshot.codeIntel.tools
    .filter((tool) => tool.source === "auto")
    .map((tool) => ({
      language: tool.language,
      server: tool.server,
      status: tool.status,
      detail: tool.detail,
      configSignals: tool.configSignals,
      runtimeSignals: tool.runtimeSignals,
    }));

  return `${JSON.stringify(
    {
      codeIntel: {
        notes: [
          "Use this file when the project depends on editor-managed or nonstandard language-server setup.",
          "Tools with the same language name replace auto-detected entries for that language.",
        ],
        suggestions: [],
        tools: defaultTools,
      },
    },
    null,
    2,
  )}\n`;
}

function buildCodeIntelSummary(
  tools: RepoCodeIntelTool[],
): Pick<RepoCodeIntelSnapshot, "overallStatus" | "summary"> {
  if (tools.length === 0) {
    return {
      overallStatus: "missing" as const,
      summary: "No verified code-intelligence setup was detected for this project.",
    };
  }

  const readyCount = tools.filter((tool) => tool.status === "ready").length;
  const partialCount = tools.filter((tool) => tool.status === "partial").length;
  const overallStatus =
    readyCount === tools.length
      ? "ready"
      : readyCount > 0 || partialCount > 0
        ? "partial"
        : "missing";

  const summary =
    overallStatus === "ready"
      ? `${readyCount} language target${readyCount === 1 ? "" : "s"} ready for semantic navigation and diagnostics.`
      : overallStatus === "partial"
        ? `${readyCount} ready, ${partialCount} partial, ${tools.length - readyCount - partialCount} missing language target${tools.length === 1 ? "" : "s"} for code intelligence.`
        : "No verified language server or code-intelligence runtime was detected for the current project languages.";

  return { overallStatus, summary };
}

function collectCodeIntelSnapshot(
  project: WorkspaceProject,
  pkg: PackageJsonLike,
): RepoCodeIntelSnapshot {
  const dependencies = collectDependencies(pkg);
  const tools: RepoCodeIntelTool[] = [];
  const suggestions = new Set<string>();

  const tsConfigSignals = [
    pathExists(repoPath(project, "tsconfig.json")) ? "tsconfig.json" : null,
    pathExists(repoPath(project, "jsconfig.json")) ? "jsconfig.json" : null,
    hasAnyDependency(dependencies, ["typescript"]) ? "typescript dependency" : null,
    hasAnyDependency(dependencies, ["next", "react"]) ? "package.json app runtime" : null,
  ].filter(Boolean) as string[];

  if (tsConfigSignals.length > 0) {
    const runtimeSignals = [
      hasAnyDependency(dependencies, ["typescript"]) ? "typescript installed in package.json" : null,
      hasAnyDependency(dependencies, ["typescript-language-server"])
        ? "typescript-language-server installed in package.json"
        : null,
      commandExists("typescript-language-server")
        ? "typescript-language-server available on PATH"
        : null,
      commandExists("tsserver") ? "tsserver available on PATH" : null,
    ].filter(Boolean) as string[];

    const status: RepoCodeIntelStatus =
      runtimeSignals.length > 0 ? "ready" : "partial";

    if (status !== "ready") {
      suggestions.add(
        "Install TypeScript tooling or expose tsserver-compatible navigation for the active JavaScript/TypeScript project.",
      );
    }

    tools.push({
      language: "TypeScript / JavaScript",
      server: "tsserver / typescript-language-server",
      status,
      source: "auto",
      configSignals: tsConfigSignals,
      runtimeSignals,
      detail:
        status === "ready"
          ? "Project config and TypeScript tooling are present for tsserver-compatible navigation and diagnostics."
          : "Project config exists, but no local TypeScript runtime or standalone language server was detected.",
    });
  }

  const pythonConfigSignals = [
    pathExists(repoPath(project, "pyproject.toml")) ? "pyproject.toml" : null,
    pathExists(repoPath(project, "requirements.txt")) ? "requirements.txt" : null,
    pathExists(repoPath(project, "requirements-dev.txt"))
      ? "requirements-dev.txt"
      : null,
    pathExists(repoPath(project, "setup.py")) ? "setup.py" : null,
  ].filter(Boolean) as string[];

  if (pythonConfigSignals.length > 0) {
    const pythonDependencyText = [
      readTextIfExists(repoPath(project, "pyproject.toml")),
      readTextIfExists(repoPath(project, "requirements.txt")),
      readTextIfExists(repoPath(project, "requirements-dev.txt")),
    ]
      .join("\n")
      .toLowerCase();

    const runtimeSignals = [
      pythonDependencyText.includes("pyright") ? "pyright referenced in project config" : null,
      pythonDependencyText.includes("basedpyright")
        ? "basedpyright referenced in project config"
        : null,
      pythonDependencyText.includes("python-lsp-server") || pythonDependencyText.includes("pylsp")
        ? "python-lsp-server referenced in project config"
        : null,
      commandExists("pyright-langserver") ? "pyright-langserver available on PATH" : null,
      commandExists("basedpyright-langserver")
        ? "basedpyright-langserver available on PATH"
        : null,
      commandExists("pylsp") ? "pylsp available on PATH" : null,
    ].filter(Boolean) as string[];

    const status: RepoCodeIntelStatus =
      runtimeSignals.length > 0 ? "ready" : "partial";

    if (status !== "ready") {
      suggestions.add(
        "Install a Python language server such as pyright, basedpyright, or pylsp for semantic navigation.",
      );
    }

    tools.push({
      language: "Python",
      server: "pyright / basedpyright / pylsp",
      status,
      source: "auto",
      configSignals: pythonConfigSignals,
      runtimeSignals,
      detail:
        status === "ready"
          ? "Python project config and a language-server runtime were detected."
          : "Python project config exists, but no supported Python language server was detected.",
    });
  }

  const hasGoProject = pathExists(repoPath(project, "go.mod"));
  if (hasGoProject) {
    const runtimeSignals = [
      commandExists("gopls") ? "gopls available on PATH" : null,
    ].filter(Boolean) as string[];
    const status: RepoCodeIntelStatus =
      runtimeSignals.length > 0 ? "ready" : "partial";

    if (status !== "ready") {
      suggestions.add("Install gopls so Go code can use semantic navigation and references.");
    }

    tools.push({
      language: "Go",
      server: "gopls",
      status,
      source: "auto",
      configSignals: ["go.mod"],
      runtimeSignals,
      detail:
        status === "ready"
          ? "Go module metadata and gopls were detected."
          : "Go module metadata exists, but gopls was not detected on this machine.",
    });
  }

  const hasRustProject = pathExists(repoPath(project, "Cargo.toml"));
  if (hasRustProject) {
    const runtimeSignals = [
      commandExists("rust-analyzer") ? "rust-analyzer available on PATH" : null,
    ].filter(Boolean) as string[];
    const status: RepoCodeIntelStatus =
      runtimeSignals.length > 0 ? "ready" : "partial";

    if (status !== "ready") {
      suggestions.add("Install rust-analyzer so Rust code has semantic navigation and diagnostics.");
    }

    tools.push({
      language: "Rust",
      server: "rust-analyzer",
      status,
      source: "auto",
      configSignals: ["Cargo.toml"],
      runtimeSignals,
      detail:
        status === "ready"
          ? "Rust manifest and rust-analyzer were detected."
          : "Rust manifest exists, but rust-analyzer was not detected on this machine.",
    });
  }

  const overrides = readCodeIntelOverrides(project);
  const overrideLanguages = new Set(
    overrides.tools.map((tool) => tool.language.toLowerCase()),
  );
  const mergedTools = [
    ...tools.filter(
      (tool) => !overrideLanguages.has(tool.language.toLowerCase()),
    ),
    ...overrides.tools,
  ];
  const summary = buildCodeIntelSummary(mergedTools);

  if (overrides.overrideError) {
    suggestions.add(
      `Fix invalid code-intelligence overrides in ${overrides.overrideFilePath}.`,
    );
  }

  for (const suggestion of overrides.suggestions) {
    suggestions.add(suggestion);
  }

  return {
    overallStatus: summary.overallStatus,
    summary: overrides.summary || summary.summary,
    tools: mergedTools,
    suggestions: Array.from(suggestions),
    notes: overrides.notes,
    overrideFilePath: overrides.overrideFilePath,
    hasOverrides: overrides.hasOverrides,
    overrideError: overrides.overrideError,
  };
}

function runGit(project: WorkspaceProject, args: string[]) {
  try {
    return execFileSync("git", ["-C", project.rootPath, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function collectGitSnapshot(project: WorkspaceProject): GitSnapshot {
  const branch = runGit(project, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch) {
    return {
      available: false,
      branch: null,
      summary: "Git metadata unavailable for this project.",
      isDirty: false,
      changedFiles: [],
      stagedCount: 0,
      modifiedCount: 0,
      untrackedCount: 0,
      recentCommits: [],
      aheadCount: 0,
      behindCount: 0,
    };
  }

  const rawStatus = runGit(project, ["status", "--short"]) || "";
  const changedFiles: GitFileChange[] = rawStatus
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim() || "??";
      return {
        status,
        path: line.slice(3).trim(),
      };
    });

  let stagedCount = 0;
  let modifiedCount = 0;
  let untrackedCount = 0;

  for (const change of rawStatus.split("\n").filter(Boolean)) {
    const staged = change[0];
    const unstaged = change[1];

    if (staged && staged !== " " && staged !== "?") {
      stagedCount += 1;
    }
    if (unstaged && unstaged !== " " && unstaged !== "?") {
      modifiedCount += 1;
    }
    if (staged === "?" || unstaged === "?") {
      untrackedCount += 1;
    }
  }

  const recentCommits = (runGit(project, [
    "log",
    "--pretty=format:%h%x09%cs%x09%s",
    "-n",
    "5",
  ]) || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, date, ...subjectParts] = line.split("\t");
      return {
        hash,
        date,
        subject: subjectParts.join("\t"),
      };
    });

  let aheadCount = 0;
  let behindCount = 0;
  const aheadBehind = runGit(project, [
    "rev-list",
    "--left-right",
    "--count",
    "@{upstream}...HEAD",
  ]);
  if (aheadBehind) {
    const [behindRaw, aheadRaw] = aheadBehind.split(/\s+/);
    behindCount = Number.parseInt(behindRaw || "0", 10) || 0;
    aheadCount = Number.parseInt(aheadRaw || "0", 10) || 0;
  }

  const dirtyCount = changedFiles.length;
  const summaryParts = [`Branch ${branch}`];
  if (dirtyCount > 0) {
    summaryParts.push(`${dirtyCount} changed files`);
  } else {
    summaryParts.push("working tree clean");
  }
  if (aheadCount > 0 || behindCount > 0) {
    summaryParts.push(`ahead ${aheadCount} / behind ${behindCount}`);
  }

  return {
    available: true,
    branch,
    summary: summaryParts.join(" - "),
    isDirty: dirtyCount > 0,
    changedFiles: changedFiles.slice(0, 10),
    stagedCount,
    modifiedCount,
    untrackedCount,
    recentCommits,
    aheadCount,
    behindCount,
  };
}

function titleOrTagsMatch(title: string, tags: string[], keywords: string[]) {
  const haystack = `${title} ${tags.join(" ")}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function countConnections(docs: Array<{ id: string; title: string; content: string }>) {
  const docsByTitle = new Map(
    docs.map((doc) => [normalizeDocumentTitle(doc.title), doc.id]),
  );
  let connections = 0;

  for (const doc of docs) {
    const normalizedSelf = normalizeDocumentTitle(doc.title);
    for (const link of extractLinks(doc.content)) {
      const normalizedLink = normalizeDocumentTitle(link);
      if (!normalizedLink || normalizedLink === normalizedSelf) {
        continue;
      }

      if (docsByTitle.has(normalizedLink)) {
        connections += 1;
      }
    }
  }

  return connections;
}

export function buildRepoSnapshot(project: WorkspaceProject): RepoSnapshot {
  const pkg = readPackageJson(project);
  const stack = detectStack(project, pkg);
  const dashboardSurfaces = collectDashboardSurfaces(project);
  const apiRoutes = collectApiRoutes(project);
  const scripts = collectScripts(pkg);
  const verificationPresets = collectVerificationPresets(project, pkg);
  const workspaceAreas = collectWorkspaceAreas(project);
  const keyFiles = collectKeyFiles(project);
  const codeIntel = collectCodeIntelSnapshot(project, pkg);
  const git = collectGitSnapshot(project);

  const summaryParts = [
    stack.length > 0 ? stack.join(", ") : "Application stack",
    verificationPresets.length > 0
      ? `${verificationPresets.length} verification commands`
      : null,
    codeIntel.tools.length > 0 ? codeIntel.summary : null,
    git.available ? git.summary : "Git unavailable",
  ].filter(Boolean) as string[];

  return {
    project: {
      id: project.id,
      name: project.name,
      relativePath: project.relativePath,
      category: project.category,
    },
    summary: summaryParts.join(" - "),
    stack,
    scripts,
    verificationPresets,
    dashboardSurfaces,
    apiRoutes,
    workspaceAreas,
    keyFiles,
    hotspots: collectHotspots(project, keyFiles),
    codeIntel,
    git,
  };
}

export function buildWorkspaceReadiness(
  userId: string,
  project: WorkspaceProject,
  options: { assumeContextFiles?: boolean } = {},
): WorkspaceReadiness {
  const docs = listDocs(userId, project.id);
  const quests = listQuests(userId, project.id);
  const reports = listReports(userId, project.id, { limit: 12 });
  const repoSnapshot = buildRepoSnapshot(project);
  const openQuestCount = quests.filter((quest) => !quest.completed).length;
  const recentReport = reports.find((report) => {
    const ageMs = Date.now() - new Date(report.date).getTime();
    return ageMs <= 7 * 24 * 60 * 60 * 1000;
  });
  const connections = countConnections(
    docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      content: doc.content,
    })),
  );
  const contextDir = getContextDir(project);
  const requiredContextFiles = [
    "PROJECT_CONTEXT.md",
    "COLLABORATION_GUIDE.md",
    "REPO_MAP.md",
    "ACTIVE_CONTEXT.md",
  ];
  const hasContextFiles = options.assumeContextFiles
    ? true
    : requiredContextFiles.every((fileName) =>
        pathExists(path.join(contextDir, fileName)),
      );

  const hasProjectCharter = docs.some((doc) =>
    titleOrTagsMatch(doc.title, doc.tags, ["charter", "context", "mission", "brief"]),
  );
  const hasArchitectureMap = docs.some((doc) =>
    titleOrTagsMatch(doc.title, doc.tags, ["architecture", "system", "overview", "map"]),
  );
  const hasWorkflowDoc = docs.some((doc) =>
    titleOrTagsMatch(doc.title, doc.tags, ["workflow", "process", "done", "quality"]),
  );
  const hasDecisionLog = docs.some((doc) =>
    titleOrTagsMatch(doc.title, doc.tags, ["decision", "adr", "architecture decision"]),
  );

  const checks: WorkspaceReadinessCheck[] = [
    {
      id: "charter",
      label: "Project charter captured",
      ready: hasProjectCharter,
      detail: hasProjectCharter
        ? "The active project has a durable charter or context doc."
        : "Add a charter or context doc so session goals remain stable across handoffs.",
      href: "/dashboard/docs",
    },
    {
      id: "architecture",
      label: "Architecture map available",
      ready: hasArchitectureMap,
      detail: hasArchitectureMap
        ? "The project has at least one system map or architecture overview."
        : "Capture the shape of the system before pushing broader implementation work.",
      href: "/dashboard/docs",
    },
    {
      id: "workflow",
      label: "Delivery workflow documented",
      ready: hasWorkflowDoc,
      detail: hasWorkflowDoc
        ? "The project explains how work should move from brief to validated delivery."
        : "Document how prompts, docs, quests, reports, and verification should work together.",
      href: "/dashboard/docs",
    },
    {
      id: "decision-log",
      label: "Decision log exists",
      ready: hasDecisionLog,
      detail: hasDecisionLog
        ? "The project can preserve architecture decisions beyond chat history."
        : "Create at least one decision log or ADR doc for durable technical choices.",
      href: "/dashboard/decisions",
    },
    {
      id: "quests",
      label: "Active quest queue exists",
      ready: openQuestCount > 0,
      detail:
        openQuestCount > 0
          ? `${openQuestCount} open quests can drive the next implementation session.`
          : "Add at least one concrete quest so the next session starts with clear intent.",
      href: "/dashboard/quests",
    },
    {
      id: "reports",
      label: "Recent delivery report exists",
      ready: Boolean(recentReport),
      detail: recentReport
        ? `A report was logged recently: ${recentReport.title}.`
        : "Log a short report after sessions so outcomes and regressions stay visible.",
      href: "/dashboard/report",
    },
    {
      id: "graph",
      label: "Docs are linked together",
      ready: connections > 0,
      detail:
        connections > 0
          ? `${connections} document links connect the project knowledge base.`
          : "Link related docs so focused prompt packs have usable local context.",
      href: "/dashboard/graph",
    },
    {
      id: "verification",
      label: "Verification commands are known",
      ready: repoSnapshot.verificationPresets.length > 0,
      detail:
        repoSnapshot.verificationPresets.length > 0
          ? "The project exposes commands for linting, testing, building, or checking."
          : "Add scripts or document commands so IDE work can be verified consistently.",
      href: "/dashboard/prompt-pack",
    },
    {
      id: "code-intel",
      label: "Code intelligence is available",
      ready: repoSnapshot.codeIntel.overallStatus === "ready",
      detail:
        repoSnapshot.codeIntel.tools.length > 0
          ? repoSnapshot.codeIntel.summary
          : "No language-server-backed project signals were detected for the active repo yet.",
      href: "/dashboard/prompt-pack",
    },
    {
      id: "git",
      label: "Git state is readable",
      ready: repoSnapshot.git.available,
      detail: repoSnapshot.git.available
        ? repoSnapshot.git.summary
        : "Initialize git or point Mission Control at a repo-backed project to enable diff-aware briefs.",
      href: "/dashboard",
    },
    {
      id: "context-files",
      label: "Context files are generated",
      ready: hasContextFiles,
      detail: hasContextFiles
        ? "Project, collaboration, repo, and active context files are available for the IDE."
        : "Generate a prompt pack or update workspace artifacts to write the context files.",
      href: "/dashboard/prompt-pack",
    },
  ];

  const readyCount = checks.filter((check) => check.ready).length;
  const score = Math.round((readyCount / checks.length) * 100);
  const status = score >= 80 ? "ready" : score >= 45 ? "partial" : "seed";
  const summary =
    status === "ready"
      ? "The active project has enough structure for efficient IDE collaboration."
      : status === "partial"
        ? "The project is usable, but a few missing artifacts will still slow down handoffs."
        : "The project needs a small collaboration scaffold before it becomes a reliable long-term context layer.";

  return {
    score,
    status,
    summary,
    checks,
  };
}

export function buildCollaborationGuide(
  readiness: WorkspaceReadiness,
  project: WorkspaceProject,
): CollaborationGuide {
  const missingInputs = readiness.checks
    .filter((check) => !check.ready)
    .slice(0, 4)
    .map((check) => check.label);

  return {
    workflow: [
      `Start from Docs, Quests, and recent Reports for ${project.name} before asking Codex to change code.`,
      "Use Prompt Pack to create one focused brief for the current task or quest.",
      "Implement directly in the active repo, then validate with the smallest useful checks.",
      "Update Docs when architecture, naming, or workflow assumptions change.",
      "Log a Report after meaningful work so later sessions inherit the outcome.",
    ],
    updateRules: [
      "Docs should hold durable decisions, architecture, and constraints.",
      "Quests should stay concrete, current, and limited to work that is actually next.",
      "Reports should record what changed, what failed, and what still needs follow-up.",
      "Keep code-intelligence prerequisites current so semantic navigation stays reliable across IDE sessions.",
      "Prompt Pack should reflect the current project and task, not act as a long-lived source of truth.",
    ],
    nextInputs: missingInputs,
  };
}

export function renderRepoSnapshotMarkdown(snapshot: RepoSnapshot) {
  const lines = [
    "# Repo Map",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Active Project",
    `- Name: ${snapshot.project.name}`,
    `- Path: ${snapshot.project.relativePath}`,
    `- Category: ${snapshot.project.category}`,
    "",
    "## Summary",
    snapshot.summary,
    "",
    "## Stack",
    ...(snapshot.stack.length
      ? snapshot.stack.map((item) => `- ${item}`)
      : ["- None detected"]),
    "",
    "## Git",
    `- ${snapshot.git.summary}`,
    ...(snapshot.git.changedFiles.length
      ? snapshot.git.changedFiles.map((change) => `- ${change.status}: ${change.path}`)
      : ["- No changed files detected"]),
    "",
    "## Verification Commands",
    ...(snapshot.verificationPresets.length
      ? snapshot.verificationPresets.map(
          (preset) => `- ${preset.label}: \`${preset.command}\``,
        )
      : ["- None detected"]),
    "",
    "## Code Intelligence",
    `- ${snapshot.codeIntel.summary}`,
    `- Override file: \`${snapshot.codeIntel.overrideFilePath}\``,
    ...(snapshot.codeIntel.overrideError
      ? [`- Override error: ${snapshot.codeIntel.overrideError}`]
      : []),
    ...(snapshot.codeIntel.tools.length
      ? snapshot.codeIntel.tools.flatMap((tool) => [
          `- ${tool.language}: ${tool.status} via ${tool.server} (${tool.source})`,
          `  ${tool.detail}`,
          ...(tool.configSignals.length
            ? [`  Config: ${tool.configSignals.join(", ")}`]
            : []),
          ...(tool.runtimeSignals.length
            ? [`  Runtime: ${tool.runtimeSignals.join(", ")}`]
            : []),
        ])
      : ["- None detected"]),
    ...(snapshot.codeIntel.notes.length
      ? ["", "### Override Notes", ...snapshot.codeIntel.notes.map((item) => `- ${item}`)]
      : []),
    ...(snapshot.codeIntel.suggestions.length
      ? ["", "### Suggested Setup", ...snapshot.codeIntel.suggestions.map((item) => `- ${item}`)]
      : []),
    "",
    "## Dashboard Surfaces",
    ...(snapshot.dashboardSurfaces.length
      ? snapshot.dashboardSurfaces.map((item) => `- ${item}`)
      : ["- None detected"]),
    "",
    "## API Routes",
    ...(snapshot.apiRoutes.length
      ? snapshot.apiRoutes.map((item) => `- ${item}`)
      : ["- None detected"]),
    "",
    "## Workspace Areas",
    ...(snapshot.workspaceAreas.length
      ? snapshot.workspaceAreas.map((item) => `- ${item}`)
      : ["- None detected"]),
    "",
    "## Key Files",
    ...(snapshot.keyFiles.length
      ? snapshot.keyFiles.flatMap((file) => [
          `- ${file.label}: \`${file.path}\``,
          `  ${file.detail}`,
        ])
      : ["- None detected"]),
    "",
    "## Hotspots",
    ...(snapshot.hotspots.length
      ? snapshot.hotspots.map((hotspot) => `- \`${hotspot.path}\`: ${hotspot.reason}`)
      : ["- None detected"]),
    "",
    "## Useful Scripts",
    ...(snapshot.scripts.length
      ? snapshot.scripts.map((script) => `- \`${script.name}\`: ${script.command}`)
      : ["- None detected"]),
  ];

  return `${lines.join("\n").trim()}\n`;
}

export function renderCollaborationGuideMarkdown(guide: CollaborationGuide) {
  const lines = [
    "# Collaboration Guide",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Workflow",
    ...guide.workflow.map((item) => `- ${item}`),
    "",
    "## Update Rules",
    ...guide.updateRules.map((item) => `- ${item}`),
    "",
    "## Missing Inputs To Add Next",
    ...(guide.nextInputs.length
      ? guide.nextInputs.map((item) => `- ${item}`)
      : ["- None. The workspace already has the expected collaboration inputs."]),
  ];

  return `${lines.join("\n").trim()}\n`;
}

export function renderIdeAgentSetupMarkdown({
  snapshot,
  guide,
  readiness,
}: {
  snapshot: RepoSnapshot;
  guide: CollaborationGuide;
  readiness: WorkspaceReadiness;
}) {
  const lines = [
    "# IDE Agent Setup",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Active Project",
    `- Name: ${snapshot.project.name}`,
    `- Path: ${snapshot.project.relativePath}`,
    `- Category: ${snapshot.project.category}`,
    "",
    "## Purpose",
    "This file tells IDE coding agents how to orient, verify work, use semantic tooling, and hand sessions off cleanly in this repo.",
    "",
    "## Read First",
    "- `.openclaw/context/PROJECT_CONTEXT.md` for the current project contract.",
    "- `.openclaw/context/COLLABORATION_GUIDE.md` for workflow and update rules.",
    "- `.openclaw/context/REPO_MAP.md` for stack, routes, scripts, and key files.",
    "- `.openclaw/context/ACTIVE_CONTEXT.md` for the latest project state.",
    "- `.openclaw/context/PROMPT_PACK.md` for the current focused session brief.",
    "- `.openclaw/context/SESSION_HANDOFF.md` for the current handoff summary.",
    "",
    "## Verification Commands",
    ...(snapshot.verificationPresets.length
      ? snapshot.verificationPresets.map(
          (preset) => `- ${preset.label}: \`${preset.command}\``,
        )
      : ["- No stable verification commands detected yet."]),
    "",
    "## Code Intelligence",
    `- Summary: ${snapshot.codeIntel.summary}`,
    `- Override file: \`${snapshot.codeIntel.overrideFilePath}\``,
    ...(snapshot.codeIntel.overrideError
      ? [`- Override error: ${snapshot.codeIntel.overrideError}`]
      : []),
    ...(snapshot.codeIntel.tools.length
      ? snapshot.codeIntel.tools.map(
          (tool) =>
            `- ${tool.language}: ${tool.status} via ${tool.server} (${tool.source})`,
        )
      : ["- No language-specific code intelligence was detected."]),
    ...(snapshot.codeIntel.notes.length
      ? ["", "### Override Notes", ...snapshot.codeIntel.notes.map((note) => `- ${note}`)]
      : []),
    ...(snapshot.codeIntel.suggestions.length
      ? ["", "### Suggested Setup", ...snapshot.codeIntel.suggestions.map((item) => `- ${item}`)]
      : []),
    "",
    "## Workflow Expectations",
    ...guide.workflow.map((item) => `- ${item}`),
    "",
    "## Update Rules",
    ...guide.updateRules.map((item) => `- ${item}`),
    "",
    "## Handoff Expectations",
    "- Update the Prompt Pack when the focus changes.",
    "- Keep Session Handoff current with the next step and verification plan.",
    "- Update Docs when naming, architecture, or workflow assumptions change.",
    "- Log a Report after meaningful work so later sessions inherit the outcome.",
    "",
    "## Current Readiness",
    `${readiness.score}/100 (${readiness.status})`,
    readiness.summary,
  ];

  return `${lines.join("\n").trim()}\n`;
}

export function buildBootstrapTemplates(
  snapshot: RepoSnapshot,
): BootstrapTemplate[] {
  const stackLine =
    snapshot.stack.length > 0 ? snapshot.stack.join(", ") : "Fill in the stack";
  const surfaceLines =
    snapshot.dashboardSurfaces.length > 0
      ? snapshot.dashboardSurfaces.map((surface) => `- ${surface}`)
      : ["- Fill in the core workspace surfaces"];
  const scriptLines =
    snapshot.verificationPresets.length > 0
      ? snapshot.verificationPresets.map(
          (script) => `- ${script.label}: \`${script.command}\``,
        )
      : snapshot.scripts.length > 0
        ? snapshot.scripts.slice(0, 5).map((script) => `- \`${script.name}\`: ${script.command}`)
        : ["- Fill in the commands used most often"];
  const codeIntelLines =
    snapshot.codeIntel.tools.length > 0
      ? [
          `- ${snapshot.codeIntel.summary}`,
          ...snapshot.codeIntel.tools.map(
            (tool) => `- ${tool.language}: ${tool.status} via ${tool.server}`,
          ),
        ]
      : ["- Record which language servers or semantic tooling this project relies on."];

  return [
    {
      title: "Workspace Charter",
      tags: ["foundation", "context"],
      matchKeywords: ["charter", "context", "mission", "brief"],
      content: [
        "# Workspace Charter",
        "",
        "## Mission",
        `Describe what ${snapshot.project.name} should achieve.`,
        "",
        "## Current Product Direction",
        "Document how this project should support human + Codex collaboration in the IDE.",
        "",
        "## Success Metrics",
        "- What makes this project successful?",
        "- What should become faster or more reliable over time?",
        "",
        "## Constraints",
        "- Technical constraints",
        "- Product constraints",
        "- Workflow constraints",
        "",
        "## Current Priorities",
        "- Priority 1",
        "- Priority 2",
        "- Priority 3",
      ].join("\n"),
    },
    {
      title: "Architecture Map",
      tags: ["architecture", "system"],
      matchKeywords: ["architecture", "system", "overview", "map"],
      content: [
        "# Architecture Map",
        "",
        "## Current Stack",
        `- ${stackLine}`,
        "",
        "## Main Surfaces",
        ...surfaceLines,
        "",
        "## Key Files",
        ...snapshot.keyFiles.slice(0, 5).map((file) => `- \`${file.path}\`: ${file.detail}`),
        "",
        "## Known Hotspots",
        ...snapshot.hotspots.slice(0, 4).map((hotspot) => `- \`${hotspot.path}\`: ${hotspot.reason}`),
        "",
        "## Decisions",
        "- Record major architecture choices here.",
      ].join("\n"),
    },
    {
      title: "Delivery Workflow",
      tags: ["workflow", "process"],
      matchKeywords: ["workflow", "process", "operating", "how we work"],
      content: [
        "# Delivery Workflow",
        "",
        "## Standard Loop",
        "1. Review Docs, Quests, and recent Reports.",
        "2. Generate a Prompt Pack for the task at hand.",
        "3. Implement in the IDE with Codex.",
        "4. Run the relevant validation steps.",
        "5. Update Docs, Quests, and Reports before ending the session.",
        "",
        "## Commands Used Often",
        ...scriptLines,
        "",
        "## Code Intelligence Setup",
        ...codeIntelLines,
        "",
        "## Handoff Rules",
        "- Update Docs when structure or decisions change.",
        "- Keep Quests concrete and current.",
        "- Log Reports after meaningful work.",
      ].join("\n"),
    },
    {
      title: "Definition of Done",
      tags: ["quality", "workflow"],
      matchKeywords: ["definition of done", "done", "quality", "ship"],
      content: [
        "# Definition of Done",
        "",
        "A task is done when:",
        "- The behavior or code change is implemented.",
        "- The relevant checks have been run.",
        "- Docs were updated if assumptions or architecture changed.",
        "- Quest state reflects the real outcome.",
        "- A short Report records what changed and what remains.",
      ].join("\n"),
    },
    {
      title: "Decision Log",
      tags: ["decision", "adr"],
      matchKeywords: ["decision", "adr", "architecture decision"],
      content: [
        "# Decision Log",
        "",
        "Use this file to capture durable technical decisions.",
        "",
        "## Entry Template",
        "- Date:",
        "- Decision:",
        "- Context:",
        "- Options considered:",
        "- Consequences:",
        "",
        "## Decisions",
        "- Add the first architecture decision here.",
      ].join("\n"),
    },
    {
      title: "IDE Agent Setup",
      tags: ["workflow", "ide", "assistant"],
      matchKeywords: ["ide agent", "codex", "cursor", "claude", "assistant setup"],
      content: [
        "# IDE Agent Setup",
        "",
        "Use this file to capture editor-specific setup that auto-detection cannot infer reliably.",
        "",
        "## Primary IDE Agents",
        "- Codex",
        "- Claude",
        "- Cursor",
        "",
        "## Verification Commands",
        ...scriptLines,
        "",
        "## Code Intelligence Overrides",
        `- Override file: \`${snapshot.codeIntel.overrideFilePath}\``,
        ...(snapshot.codeIntel.tools.length
          ? snapshot.codeIntel.tools.map(
              (tool) =>
                `- ${tool.language}: ${tool.status} via ${tool.server} (${tool.source})`,
            )
          : ["- Fill in the language servers or semantic tools this repo expects."]),
        "",
        "## Editor Notes",
        "- Record any editor-specific settings, extensions, workspace files, or commands here.",
        "",
        "## Handoff Rules",
        "- Generate Prompt Pack before implementation sessions.",
        "- Keep Session Handoff current before ending the session.",
        "- Update this file if editor tooling or semantic setup changes.",
      ].join("\n"),
    },
  ];
}
