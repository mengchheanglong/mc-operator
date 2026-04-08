import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import {
  findWorkspaceProject,
  getControlPlaneProjectId,
  type WorkspaceProject,
} from "@/server/projects/workspace-projects";
import {
  buildRepoSnapshot,
  clearCodeGraphContextSnapshotCache,
  clearCodeIntelSnapshotCache,
  clearGitSnapshotCache,
  clearRepoSnapshotCache,
  clearRepoStaticSurfacesCache,
} from "@/server/services/workspace-intel-service";

type PackageJsonLike = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type RepoPhaseRun = {
  packageMs: number;
  stackMs: number;
  dashboardMs: number;
  apiRoutesMs: number;
  scriptsMs: number;
  verificationMs: number;
  workspaceAreasMs: number;
  keyFilesMs: number;
  gitMs: number;
  hotspotsMs: number;
  totalMs: number;
  staticSubtotalMs: number;
  residualMs: number;
};

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function repoPath(project: WorkspaceProject, ...segments: string[]) {
  return path.join(project.rootPath, ...segments);
}

function pathExists(targetPath: string) {
  return fs.existsSync(targetPath);
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

function collectDependencies(pkg: PackageJsonLike) {
  return {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
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

function humanizeSegment(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function collectDashboardSurfaces(project: WorkspaceProject) {
  return listDirectoryNames(repoPath(project, "src", "app", "dashboard"))
    .filter((name) => name !== "chat")
    .map(humanizeSegment);
}

function collectApiRoutes(
  project: WorkspaceProject,
  basePath = repoPath(project, "src", "app", "api"),
): string[] {
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

function collectScripts(pkg: PackageJsonLike) {
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

function collectVerificationPresets(project: WorkspaceProject, pkg: PackageJsonLike) {
  const presets: Array<{ kind: string; label: string; command: string }> = [];
  const scriptMap = pkg.scripts || {};

  const preferredScriptKinds = [
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

  return presets;
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

function collectKeyFiles(project: WorkspaceProject) {
  const candidates = [
    "package.json",
    "README.md",
    "tsconfig.json",
    "next.config.js",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    ".openclaw/project-intel.json",
    "src/app/layout.tsx",
    "src/main.ts",
  ];

  return candidates.filter((candidate) => pathExists(repoPath(project, candidate)));
}

function collectHotspots(keyFiles: string[]) {
  return keyFiles.slice(0, 5);
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

function collectGitSnapshotLite(project: WorkspaceProject) {
  const rawStatusWithBranch = runGit(project, [
    "status",
    "--porcelain=1",
    "--branch",
  ]);
  if (!rawStatusWithBranch) {
    return { available: false };
  }

  const recentCommits = runGit(project, [
    "log",
    "--pretty=format:%h%x09%cs%x09%s",
    "-n",
    "5",
  ]);

  return {
    available: true,
    statusLines: rawStatusWithBranch.split("\n").filter(Boolean).length,
    recentCommits: recentCommits?.split("\n").filter(Boolean).length || 0,
  };
}

function clearRepoPhaseCaches(project: WorkspaceProject) {
  clearRepoSnapshotCache(project);
  clearGitSnapshotCache(project);
  clearRepoStaticSurfacesCache(project);
  clearCodeIntelSnapshotCache(project);
  clearCodeGraphContextSnapshotCache(project);
}

async function runOnce(project: WorkspaceProject, cacheMode: "cold" | "inner_warm") {
  if (cacheMode === "cold") {
    clearRepoPhaseCaches(project);
  } else {
    clearRepoPhaseCaches(project);
    buildRepoSnapshot(project);
    clearRepoSnapshotCache(project);
  }

  const packageStarted = performance.now();
  const pkg = readPackageJson(project);
  const packageMs = performance.now() - packageStarted;

  const stackStarted = performance.now();
  const stack = detectStack(project, pkg);
  const stackMs = performance.now() - stackStarted;

  const dashboardStarted = performance.now();
  const dashboard = collectDashboardSurfaces(project);
  const dashboardMs = performance.now() - dashboardStarted;

  const apiRoutesStarted = performance.now();
  const apiRoutes = collectApiRoutes(project);
  const apiRoutesMs = performance.now() - apiRoutesStarted;

  const scriptsStarted = performance.now();
  const scripts = collectScripts(pkg);
  const scriptsMs = performance.now() - scriptsStarted;

  const verificationStarted = performance.now();
  const verification = collectVerificationPresets(project, pkg);
  const verificationMs = performance.now() - verificationStarted;

  const workspaceAreasStarted = performance.now();
  const workspaceAreas = collectWorkspaceAreas(project);
  const workspaceAreasMs = performance.now() - workspaceAreasStarted;

  const keyFilesStarted = performance.now();
  const keyFiles = collectKeyFiles(project);
  const keyFilesMs = performance.now() - keyFilesStarted;

  const gitStarted = performance.now();
  const git = collectGitSnapshotLite(project);
  const gitMs = performance.now() - gitStarted;

  const hotspotsStarted = performance.now();
  const hotspots = collectHotspots(keyFiles);
  const hotspotsMs = performance.now() - hotspotsStarted;

  const totalStarted = performance.now();
  const snapshot = buildRepoSnapshot(project);
  const totalMs = performance.now() - totalStarted;

  const staticSubtotalMs =
    packageMs +
    stackMs +
    dashboardMs +
    apiRoutesMs +
    scriptsMs +
    verificationMs +
    workspaceAreasMs +
    keyFilesMs +
    gitMs +
    hotspotsMs;

  return {
    packageMs,
    stackMs,
    dashboardMs,
    apiRoutesMs,
    scriptsMs,
    verificationMs,
    workspaceAreasMs,
    keyFilesMs,
    gitMs,
    hotspotsMs,
    totalMs,
    staticSubtotalMs,
    residualMs: totalMs - staticSubtotalMs,
    counts: {
      stack: stack.length,
      dashboard: dashboard.length,
      apiRoutes: apiRoutes.length,
      scripts: scripts.length,
      verification: verification.length,
      workspaceAreas: workspaceAreas.length,
      keyFiles: keyFiles.length,
      hotspots: hotspots.length,
      gitAvailable: git.available,
      codeIntelTools: snapshot.codeIntel.tools.length,
      snapshotRoutes: snapshot.apiRoutes.length,
    },
  };
}

function summarizeRuns(runs: RepoPhaseRun[]) {
  return {
    packageMs: Number(average(runs.map((run) => run.packageMs)).toFixed(2)),
    stackMs: Number(average(runs.map((run) => run.stackMs)).toFixed(2)),
    dashboardMs: Number(average(runs.map((run) => run.dashboardMs)).toFixed(2)),
    apiRoutesMs: Number(average(runs.map((run) => run.apiRoutesMs)).toFixed(2)),
    scriptsMs: Number(average(runs.map((run) => run.scriptsMs)).toFixed(2)),
    verificationMs: Number(average(runs.map((run) => run.verificationMs)).toFixed(2)),
    workspaceAreasMs: Number(average(runs.map((run) => run.workspaceAreasMs)).toFixed(2)),
    keyFilesMs: Number(average(runs.map((run) => run.keyFilesMs)).toFixed(2)),
    gitMs: Number(average(runs.map((run) => run.gitMs)).toFixed(2)),
    hotspotsMs: Number(average(runs.map((run) => run.hotspotsMs)).toFixed(2)),
    totalMs: Number(average(runs.map((run) => run.totalMs)).toFixed(2)),
    staticSubtotalMs: Number(
      average(runs.map((run) => run.staticSubtotalMs)).toFixed(2),
    ),
    residualMs: Number(average(runs.map((run) => run.residualMs)).toFixed(2)),
  };
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "3", 10) || 3;
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  const coldRuns: RepoPhaseRun[] = [];
  const innerWarmRuns: RepoPhaseRun[] = [];
  let lastCounts: Record<string, number | boolean> | undefined;

  for (let index = 0; index < iterations; index += 1) {
    const coldRun = await runOnce(project, "cold");
    coldRuns.push({
      packageMs: coldRun.packageMs,
      stackMs: coldRun.stackMs,
      dashboardMs: coldRun.dashboardMs,
      apiRoutesMs: coldRun.apiRoutesMs,
      scriptsMs: coldRun.scriptsMs,
      verificationMs: coldRun.verificationMs,
      workspaceAreasMs: coldRun.workspaceAreasMs,
      keyFilesMs: coldRun.keyFilesMs,
      gitMs: coldRun.gitMs,
      hotspotsMs: coldRun.hotspotsMs,
      totalMs: coldRun.totalMs,
      staticSubtotalMs: coldRun.staticSubtotalMs,
      residualMs: coldRun.residualMs,
    });
    lastCounts = coldRun.counts;

    const innerWarmRun = await runOnce(project, "inner_warm");
    innerWarmRuns.push({
      packageMs: innerWarmRun.packageMs,
      stackMs: innerWarmRun.stackMs,
      dashboardMs: innerWarmRun.dashboardMs,
      apiRoutesMs: innerWarmRun.apiRoutesMs,
      scriptsMs: innerWarmRun.scriptsMs,
      verificationMs: innerWarmRun.verificationMs,
      workspaceAreasMs: innerWarmRun.workspaceAreasMs,
      keyFilesMs: innerWarmRun.keyFilesMs,
      gitMs: innerWarmRun.gitMs,
      hotspotsMs: innerWarmRun.hotspotsMs,
      totalMs: innerWarmRun.totalMs,
      staticSubtotalMs: innerWarmRun.staticSubtotalMs,
      residualMs: innerWarmRun.residualMs,
    });
  }

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        iterations,
        counts: lastCounts,
        coldAverages: summarizeRuns(coldRuns),
        innerWarmAverages: summarizeRuns(innerWarmRuns),
        coldRuns,
        innerWarmRuns,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
