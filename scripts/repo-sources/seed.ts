import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getRepoSourcesScriptPaths } from "./paths.ts";

interface RepoSourceEntry {
  name: string;
  path: string;
  remote: string;
  defaultBranch: string;
  track: boolean;
  enabled: boolean;
  allowDirty?: boolean;
}

interface RepoSourcesConfig {
  version: 1;
  repositories: RepoSourceEntry[];
}

const DEFAULT_REMOTE = "origin";
const DEFAULT_BRANCH = "main";

const REPO_POLICY_OVERRIDES: Record<
  string,
  Partial<Pick<RepoSourceEntry, "track" | "enabled" | "allowDirty">>
> = {
  "mc-operator": { allowDirty: true },
  "venturespace/projects/Auto-Analyst": { track: false },
  "directive-workspace/forge/source-packs/scripts": { track: false },
  "directive-workspace/forge/source-packs/software-design-philosophy-skill": { track: false },
  "studyspace/services/local-rag-ai-assistant": { track: false },
  "studyspace/services/notebooklm-py": { track: false },
  "tools/make-wrapper": { track: false },
};

function workspaceRootFromMissionControlCwd() {
  return getRepoSourcesScriptPaths().workspaceRoot;
}

function registryPathFromWorkspaceRoot(workspaceRoot: string) {
  return path.resolve(
    process.env.MISSION_CONTROL_REPO_SOURCES_PATH || path.join(workspaceRoot, "repo-sources.json"),
  );
}

function runGit(args: string[], cwd: string, timeoutMs = 30_000) {
  const proc = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
  });
  return {
    ok: (proc.status ?? 1) === 0,
    stdout: String(proc.stdout || "").trim(),
    stderr: String(proc.stderr || "").trim(),
  };
}

function normalizePath(input: string) {
  return path.resolve(input).replace(/\\/g, "/").toLowerCase();
}

function isGitRepoRoot(rootPath: string) {
  const result = runGit(["rev-parse", "--show-toplevel"], rootPath);
  if (!result.ok || !result.stdout) return false;
  return normalizePath(result.stdout) === normalizePath(rootPath);
}

function discoverDefaultBranch(rootPath: string, remote: string) {
  const symbolic = runGit(["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`], rootPath);
  if (symbolic.ok && symbolic.stdout.includes("/")) {
    return symbolic.stdout.split("/").slice(1).join("/") || DEFAULT_BRANCH;
  }

  const currentBranch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], rootPath);
  if (currentBranch.ok && currentBranch.stdout && currentBranch.stdout !== "HEAD") {
    return currentBranch.stdout;
  }
  return DEFAULT_BRANCH;
}

function discoverRemote(rootPath: string) {
  const remotes = runGit(["remote"], rootPath);
  if (!remotes.ok || !remotes.stdout) return DEFAULT_REMOTE;
  const values = remotes.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (values.includes(DEFAULT_REMOTE)) return DEFAULT_REMOTE;
  return values[0] || DEFAULT_REMOTE;
}

function addRepo(
  target: RepoSourceEntry[],
  workspaceRoot: string,
  absolutePath: string,
  enabled = true,
) {
  if (!fs.existsSync(absolutePath)) return;
  if (!isGitRepoRoot(absolutePath)) return;
  const relativePath = path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/");
  const remote = discoverRemote(absolutePath);
  const defaultBranch = discoverDefaultBranch(absolutePath, remote);

  target.push({
    name: path.basename(absolutePath),
    path: relativePath,
    remote,
    defaultBranch,
    track: true,
    enabled,
  });
}

function scanDirectChildren(
  target: RepoSourceEntry[],
  workspaceRoot: string,
  parent: string,
  enabled = true,
) {
  if (!fs.existsSync(parent)) return;
  const entries = fs.readdirSync(parent, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const entry of entries) {
    addRepo(target, workspaceRoot, path.join(parent, entry.name), enabled);
  }
}

function dedupeAndSort(entries: RepoSourceEntry[]) {
  const byPath = new Map<string, RepoSourceEntry>();
  for (const entry of entries) {
    byPath.set(entry.path, entry);
  }
  return [...byPath.values()]
    .map((entry) => {
      const override = REPO_POLICY_OVERRIDES[entry.path];
      if (!override) return entry;
      return {
        ...entry,
        ...override,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function main() {
  const force = process.argv.includes("--force");
  const {
    workspaceRoot,
    directiveForgeSourcePacksRoot,
  } = getRepoSourcesScriptPaths();
  const registryPath = registryPathFromWorkspaceRoot(workspaceRoot);

  if (fs.existsSync(registryPath) && !force) {
    process.stderr.write(
      `Registry already exists: ${registryPath}\nUse "npm run ops:repo-sources:seed -- --force" to overwrite.\n`,
    );
    process.exit(1);
  }

  const repositories: RepoSourceEntry[] = [];

  addRepo(repositories, workspaceRoot, path.join(workspaceRoot, "mc-operator"), true);
  scanDirectChildren(repositories, workspaceRoot, path.join(workspaceRoot, "projects"), true);
  scanDirectChildren(repositories, workspaceRoot, path.join(workspaceRoot, "tools"), true);
  scanDirectChildren(repositories, workspaceRoot, directiveForgeSourcePacksRoot, true);
  scanDirectChildren(
    repositories,
    workspaceRoot,
    path.join(workspaceRoot, "venturespace", "projects"),
    true,
  );
  scanDirectChildren(
    repositories,
    workspaceRoot,
    path.join(workspaceRoot, "studyspace", "services"),
    true,
  );
  scanDirectChildren(repositories, workspaceRoot, path.join(workspaceRoot, "archive"), false);

  const finalEntries = dedupeAndSort(repositories);
  const config: RepoSourcesConfig = {
    version: 1,
    repositories: finalEntries,
  };
  fs.writeFileSync(registryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        registryPath,
        repositories: finalEntries.length,
        enabled: finalEntries.filter((entry) => entry.enabled).length,
      },
      null,
      2,
    )}\n`,
  );
}

main();
