import fs from "node:fs";
import path from "node:path";

export interface RepoSourcesConfigEntry {
  name: string;
  path: string;
  remote?: string;
  defaultBranch?: string;
  track?: boolean;
  enabled?: boolean;
  allowDirty?: boolean;
}

export interface RepoSourcesConfigFile {
  version: 1;
  repositories: RepoSourcesConfigEntry[];
}

function normalizeConfigEntry(entry: RepoSourcesConfigEntry): RepoSourcesConfigEntry {
  return {
    name: String(entry.name || "").trim(),
    path: String(entry.path || "").trim().replace(/\\/g, "/"),
    remote: entry.remote ? String(entry.remote).trim() : undefined,
    defaultBranch: entry.defaultBranch ? String(entry.defaultBranch).trim() : undefined,
    track: entry.track !== false,
    enabled: entry.enabled !== false,
    allowDirty: entry.allowDirty === true,
  };
}

export function getRepoSourcesConfigPath(projectRootPath: string) {
  const workspaceRoot = path.resolve(projectRootPath, "..");
  return path.join(workspaceRoot, "repo-sources.json");
}

export function readRepoSourcesConfig(projectRootPath: string): RepoSourcesConfigFile {
  const configPath = getRepoSourcesConfigPath(projectRootPath);
  if (!fs.existsSync(configPath)) {
    throw new Error(`repo_sources_config_missing: ${configPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<RepoSourcesConfigFile>;
  if (parsed.version !== 1 || !Array.isArray(parsed.repositories)) {
    throw new Error(`repo_sources_config_invalid: ${configPath}`);
  }

  return {
    version: 1,
    repositories: parsed.repositories.map((entry) => normalizeConfigEntry(entry)),
  };
}

export function writeRepoSourcesConfig(projectRootPath: string, config: RepoSourcesConfigFile) {
  const configPath = getRepoSourcesConfigPath(projectRootPath);
  const normalized: RepoSourcesConfigFile = {
    version: 1,
    repositories: config.repositories.map((entry) => normalizeConfigEntry(entry)),
  };

  fs.writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return configPath;
}

export function updateRepoSourcesConfigEntry(
  projectRootPath: string,
  repoPath: string,
  patch: { track?: boolean; enabled?: boolean },
) {
  const normalizedRepoPath = String(repoPath || "").trim().replace(/\\/g, "/");
  if (!normalizedRepoPath) {
    throw new Error("repo_sources_repo_path_required");
  }

  const config = readRepoSourcesConfig(projectRootPath);
  const index = config.repositories.findIndex(
    (entry) => entry.path.replace(/\\/g, "/") === normalizedRepoPath,
  );
  if (index < 0) {
    throw new Error(`repo_sources_entry_not_found: ${normalizedRepoPath}`);
  }

  const current = config.repositories[index];
  const next: RepoSourcesConfigEntry = {
    ...current,
    ...(patch.track === undefined ? {} : { track: patch.track }),
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
  };
  config.repositories[index] = normalizeConfigEntry(next);
  const configPath = writeRepoSourcesConfig(projectRootPath, config);
  return {
    configPath,
    entry: config.repositories[index],
  };
}
