import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type AgencyAgentsFailureClass =
  | "invalid_input"
  | "source_missing"
  | "snapshot_missing"
  | "timeout"
  | "execution_failed";

export type AgencyAgentsProfile = "all" | "engineering" | "testing" | "product";

export interface AgencyAgentsManifestFile {
  path: string;
  bytes: number;
  hash: string;
}

export interface AgencyAgentsManifest {
  version: 1;
  generatedAt: string;
  rootPath: string;
  profile: AgencyAgentsProfile;
  selectedDirectories: string[];
  fileCount: number;
  markdownFiles: number;
  topLevelDirectories: number;
  totalBytes: number;
  hash: string;
  files: AgencyAgentsManifestFile[];
}

export interface AgencyAgentsSnapshotSummary {
  snapshotId: string;
  snapshotPath: string;
  manifestPath: string;
  createdAt: string;
  hash: string;
  fileCount: number;
}

interface AgencyAgentsSnapshotIndex {
  version: 1;
  snapshots: AgencyAgentsSnapshotSummary[];
}

export interface AgencyAgentsChangeSummary {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  sampleAdded: string[];
  sampleRemoved: string[];
  sampleModified: string[];
}

export interface AgencyAgentsSyncSummary {
  sourceRoot: string;
  targetRoot: string;
  profile: AgencyAgentsProfile;
  selectedDirectories: string[];
  markdownFiles: number;
  fileCount: number;
  totalBytes: number;
  topLevelDirectories: number;
  manifestHash: string;
  manifestPath: string;
  preSnapshot: AgencyAgentsSnapshotSummary | null;
  postSnapshot: AgencyAgentsSnapshotSummary | null;
  changes: AgencyAgentsChangeSummary;
}

export interface AgencyAgentsSyncResult {
  action: "sync";
  durationMs: number;
  timedOut: boolean;
  summary: AgencyAgentsSyncSummary;
}

export interface AgencyAgentsRollbackSummary {
  targetRoot: string;
  dryRun: boolean;
  restoredSnapshot: AgencyAgentsSnapshotSummary;
  manifestHash: string;
  manifestPath: string;
  fileCount: number;
  markdownFiles: number;
  topLevelDirectories: number;
}

export interface AgencyAgentsRollbackResult {
  action: "rollback";
  durationMs: number;
  timedOut: boolean;
  summary: AgencyAgentsRollbackSummary;
}

const MANIFEST_FILE = ".agency-agents-manifest.json";
const SNAPSHOT_INDEX_FILE = "snapshots-index.json";
const SNAPSHOT_POINTER_FILE = "latest.json";

const PROFILE_DIRECTORY_MAP: Record<AgencyAgentsProfile, string[]> = {
  all: [],
  engineering: ["engineering", "integrations", "examples", "specialized"],
  testing: ["testing", "engineering", "integrations", "examples"],
  product: [
    "product",
    "project-management",
    "strategy",
    "design",
    "support",
    "marketing",
    "sales",
  ],
};

function normalizeTopLevelName(value: string) {
  return value.trim().toLowerCase();
}

function shouldExcludePath(inputPath: string) {
  const base = normalizeTopLevelName(path.basename(inputPath));
  return base === ".git" || base === ".github" || base === "node_modules";
}

function shouldExcludeRelative(relativePath: string) {
  if (!relativePath) return false;
  return relativePath
    .split(path.sep)
    .some((part) => shouldExcludePath(part) || part === MANIFEST_FILE);
}

async function listTopLevelDirectories(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const topLevel = await readdir(root, { withFileTypes: true });
  return topLevel
    .filter((entry) => entry.isDirectory() && !shouldExcludePath(entry.name))
    .map((entry) => normalizeTopLevelName(entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function collectManifestFiles(
  root: string,
  baseRoot = root,
): Promise<AgencyAgentsManifestFile[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files: AgencyAgentsManifestFile[] = [];

  for (const entry of entries) {
    const full = path.join(root, entry.name);
    const relative = path.relative(baseRoot, full);
    if (shouldExcludeRelative(relative)) continue;

    if (entry.isDirectory()) {
      files.push(...(await collectManifestFiles(full, baseRoot)));
      continue;
    }
    if (!entry.isFile()) continue;

    const bytes = await readFile(full);
    files.push({
      path: relative.split(path.sep).join("/"),
      bytes: bytes.byteLength,
      hash: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

function buildManifestHash(files: AgencyAgentsManifestFile[]) {
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(`${file.path}|${file.bytes}|${file.hash}\n`);
  }
  return digest.digest("hex");
}

export async function buildAgencyAgentsManifest(input: {
  rootPath: string;
  profile?: AgencyAgentsProfile;
  selectedDirectories?: string[];
}): Promise<AgencyAgentsManifest> {
  const selectedDirectories = [...(input.selectedDirectories || [])].sort((a, b) =>
    a.localeCompare(b),
  );
  const files = await collectManifestFiles(input.rootPath);
  const markdownFiles = files.filter((item) =>
    item.path.toLowerCase().endsWith(".md"),
  ).length;
  const totalBytes = files.reduce((sum, item) => sum + item.bytes, 0);
  const topLevelDirectories = (await listTopLevelDirectories(input.rootPath)).length;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    rootPath: input.rootPath,
    profile: input.profile || "all",
    selectedDirectories,
    fileCount: files.length,
    markdownFiles,
    topLevelDirectories,
    totalBytes,
    hash: buildManifestHash(files),
    files,
  };
}

async function writeManifest(rootPath: string, manifest: AgencyAgentsManifest) {
  await mkdir(rootPath, { recursive: true });
  const manifestPath = path.resolve(rootPath, MANIFEST_FILE);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

async function readManifest(rootPath: string): Promise<AgencyAgentsManifest | null> {
  const manifestPath = path.resolve(rootPath, MANIFEST_FILE);
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgencyAgentsManifest>;
    if (
      parsed &&
      parsed.version === 1 &&
      Array.isArray(parsed.files) &&
      typeof parsed.hash === "string"
    ) {
      return parsed as AgencyAgentsManifest;
    }
  } catch {
    return null;
  }
  return null;
}

async function readSnapshotIndex(snapshotRoot: string): Promise<AgencyAgentsSnapshotIndex> {
  const indexPath = path.resolve(snapshotRoot, SNAPSHOT_INDEX_FILE);
  if (!existsSync(indexPath)) {
    return { version: 1, snapshots: [] };
  }
  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgencyAgentsSnapshotIndex>;
    if (parsed?.version === 1 && Array.isArray(parsed.snapshots)) {
      return {
        version: 1,
        snapshots: parsed.snapshots
          .filter((item) => item && typeof item.snapshotId === "string")
          .map((item) => ({
            snapshotId: String(item.snapshotId),
            snapshotPath: String(item.snapshotPath),
            manifestPath: String(item.manifestPath),
            createdAt: String(item.createdAt),
            hash: String(item.hash),
            fileCount: Number(item.fileCount || 0),
          })),
      };
    }
  } catch {
    return { version: 1, snapshots: [] };
  }
  return { version: 1, snapshots: [] };
}

async function writeSnapshotIndex(
  snapshotRoot: string,
  index: AgencyAgentsSnapshotIndex,
) {
  await mkdir(snapshotRoot, { recursive: true });
  await writeFile(
    path.resolve(snapshotRoot, SNAPSHOT_INDEX_FILE),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8",
  );
}

async function writeSnapshotPointer(
  snapshotRoot: string,
  snapshot: AgencyAgentsSnapshotSummary,
) {
  await mkdir(snapshotRoot, { recursive: true });
  await writeFile(
    path.resolve(snapshotRoot, SNAPSHOT_POINTER_FILE),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
}

async function readSnapshotPointer(
  snapshotRoot: string,
): Promise<AgencyAgentsSnapshotSummary | null> {
  const pointerPath = path.resolve(snapshotRoot, SNAPSHOT_POINTER_FILE);
  if (!existsSync(pointerPath)) return null;
  try {
    const raw = await readFile(pointerPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgencyAgentsSnapshotSummary>;
    if (parsed?.snapshotId && parsed.snapshotPath && parsed.manifestPath) {
      return {
        snapshotId: String(parsed.snapshotId),
        snapshotPath: String(parsed.snapshotPath),
        manifestPath: String(parsed.manifestPath),
        createdAt: String(parsed.createdAt || ""),
        hash: String(parsed.hash || ""),
        fileCount: Number(parsed.fileCount || 0),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function diffAgencyAgentsManifests(
  previous: AgencyAgentsManifest | null,
  next: AgencyAgentsManifest,
): AgencyAgentsChangeSummary {
  const previousByPath = new Map(previous?.files.map((item) => [item.path, item]) || []);
  const nextByPath = new Map(next.files.map((item) => [item.path, item]));
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  let unchanged = 0;

  for (const [filePath, nextFile] of nextByPath) {
    const prevFile = previousByPath.get(filePath);
    if (!prevFile) {
      added.push(filePath);
      continue;
    }
    if (prevFile.hash !== nextFile.hash || prevFile.bytes !== nextFile.bytes) {
      modified.push(filePath);
      continue;
    }
    unchanged += 1;
  }

  for (const [filePath] of previousByPath) {
    if (!nextByPath.has(filePath)) removed.push(filePath);
  }

  return {
    added: added.length,
    removed: removed.length,
    modified: modified.length,
    unchanged,
    sampleAdded: added.slice(0, 10),
    sampleRemoved: removed.slice(0, 10),
    sampleModified: modified.slice(0, 10),
  };
}

async function createSnapshot(input: {
  sourceRoot: string;
  snapshotRoot: string;
  profile: AgencyAgentsProfile;
  selectedDirectories: string[];
}): Promise<AgencyAgentsSnapshotSummary> {
  const createdAt = new Date().toISOString();
  const snapshotId = `${createdAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const snapshotPath = path.resolve(input.snapshotRoot, snapshotId);
  await mkdir(input.snapshotRoot, { recursive: true });
  await cp(input.sourceRoot, snapshotPath, {
    recursive: true,
    force: true,
    filter: (source) =>
      !shouldExcludeRelative(path.relative(input.sourceRoot, source)),
  });
  const manifest = await buildAgencyAgentsManifest({
    rootPath: snapshotPath,
    profile: input.profile,
    selectedDirectories: input.selectedDirectories,
  });
  const manifestPath = await writeManifest(snapshotPath, manifest);
  const summary: AgencyAgentsSnapshotSummary = {
    snapshotId,
    snapshotPath,
    manifestPath,
    createdAt,
    hash: manifest.hash,
    fileCount: manifest.fileCount,
  };

  const snapshotIndex = await readSnapshotIndex(input.snapshotRoot);
  snapshotIndex.snapshots.push(summary);
  await writeSnapshotIndex(input.snapshotRoot, snapshotIndex);
  await writeSnapshotPointer(input.snapshotRoot, summary);
  return summary;
}

async function withTimeout<T>(input: {
  timeoutMs: number;
  timeoutMessage: string;
  operation: Promise<T>;
}) {
  return await Promise.race([
    input.operation,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(input.timeoutMessage));
      }, input.timeoutMs);
    }),
  ]);
}

export async function resolveAgencyAgentsSelection(input: {
  sourceRoot: string;
  profile?: AgencyAgentsProfile;
  includeDirectories?: string[];
}) {
  const profile = input.profile || "all";
  const sourceTopLevelDirectories = await listTopLevelDirectories(input.sourceRoot);
  const sourceSet = new Set(sourceTopLevelDirectories);

  const explicit = (input.includeDirectories || [])
    .map((item) => normalizeTopLevelName(item))
    .filter(Boolean);
  const explicitSet = new Set(explicit);

  const selectedDirectories =
    explicit.length > 0
      ? [...explicitSet]
      : profile === "all"
        ? [...sourceTopLevelDirectories]
        : PROFILE_DIRECTORY_MAP[profile].filter((item) => sourceSet.has(item));

  const missing = selectedDirectories.filter((item) => !sourceSet.has(item));
  if (missing.length > 0) {
    throw new Error(
      `invalid_input: includeDirectories missing in source root -> ${missing.join(",")}`,
    );
  }
  if (selectedDirectories.length === 0 && sourceTopLevelDirectories.length > 0) {
    throw new Error(`invalid_input: no directories selected for profile=${profile}`);
  }

  selectedDirectories.sort((a, b) => a.localeCompare(b));
  return {
    profile,
    selectedDirectories,
    sourceTopLevelDirectories,
  };
}

export function classifyAgencyAgentsFailure(input: {
  timedOut?: boolean;
  sourceMissing?: boolean;
  snapshotMissing?: boolean;
  invalidInput?: boolean;
}): AgencyAgentsFailureClass {
  if (input.invalidInput) return "invalid_input";
  if (input.sourceMissing) return "source_missing";
  if (input.snapshotMissing) return "snapshot_missing";
  if (input.timedOut) return "timeout";
  return "execution_failed";
}

export function normalizeAgencyAgentsFailureClass(
  error: unknown,
): AgencyAgentsFailureClass {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("invalid_input:")) return "invalid_input";
  if (message.includes("source_missing:")) return "source_missing";
  if (message.includes("snapshot_missing:")) return "snapshot_missing";
  if (message.toLowerCase().includes("timeout")) return "timeout";
  return "execution_failed";
}

export async function runAgencyAgentsSync(input: {
  sourceRoot: string;
  targetRoot: string;
  snapshotRoot: string;
  timeoutMs: number;
  profile?: AgencyAgentsProfile;
  includeDirectories?: string[];
}): Promise<AgencyAgentsSyncResult> {
  if (!input.sourceRoot || !input.targetRoot) {
    throw new Error("invalid_input: sourceRoot and targetRoot are required");
  }
  if (!existsSync(input.sourceRoot)) {
    throw new Error(
      `source_missing: agency-agents source not found at ${input.sourceRoot}`,
    );
  }

  const startedAt = Date.now();
  const summary = await withTimeout({
    timeoutMs: input.timeoutMs,
    timeoutMessage: `timeout: agency-agents sync exceeded ${input.timeoutMs}ms`,
    operation: (async () => {
      const selection = await resolveAgencyAgentsSelection({
        sourceRoot: input.sourceRoot,
        profile: input.profile,
        includeDirectories: input.includeDirectories,
      });
      const selectedSet = new Set(selection.selectedDirectories);
      const sourceTopLevelDirectorySet = new Set(selection.sourceTopLevelDirectories);

      const previousManifest =
        (await readManifest(input.targetRoot)) ||
        (existsSync(input.targetRoot)
          ? await buildAgencyAgentsManifest({
              rootPath: input.targetRoot,
              profile: selection.profile,
              selectedDirectories: selection.selectedDirectories,
            })
          : null);

      const hasExistingFiles = (previousManifest?.fileCount || 0) > 0;
      const preSnapshot = hasExistingFiles
        ? await createSnapshot({
            sourceRoot: input.targetRoot,
            snapshotRoot: input.snapshotRoot,
            profile: previousManifest?.profile || "all",
            selectedDirectories: previousManifest?.selectedDirectories || [],
          })
        : null;

      await rm(input.targetRoot, { recursive: true, force: true });
      await mkdir(input.targetRoot, { recursive: true });

      await cp(input.sourceRoot, input.targetRoot, {
        recursive: true,
        force: true,
        filter: (source) => {
          const relative = path.relative(input.sourceRoot, source);
          if (!relative) return true;
          if (shouldExcludeRelative(relative)) return false;
          const topLevel = normalizeTopLevelName(relative.split(path.sep)[0] || "");
          if (!topLevel) return true;
          if (!sourceTopLevelDirectorySet.has(topLevel)) return true;
          return selectedSet.has(topLevel);
        },
      });

      const manifest = await buildAgencyAgentsManifest({
        rootPath: input.targetRoot,
        profile: selection.profile,
        selectedDirectories: selection.selectedDirectories,
      });
      const manifestPath = await writeManifest(input.targetRoot, manifest);
      const postSnapshot = await createSnapshot({
        sourceRoot: input.targetRoot,
        snapshotRoot: input.snapshotRoot,
        profile: selection.profile,
        selectedDirectories: selection.selectedDirectories,
      });
      const changes = diffAgencyAgentsManifests(previousManifest, manifest);

      return {
        sourceRoot: input.sourceRoot,
        targetRoot: input.targetRoot,
        profile: selection.profile,
        selectedDirectories: selection.selectedDirectories,
        markdownFiles: manifest.markdownFiles,
        fileCount: manifest.fileCount,
        totalBytes: manifest.totalBytes,
        topLevelDirectories: manifest.topLevelDirectories,
        manifestHash: manifest.hash,
        manifestPath,
        preSnapshot,
        postSnapshot,
        changes,
      } satisfies AgencyAgentsSyncSummary;
    })(),
  });

  return {
    action: "sync",
    durationMs: Date.now() - startedAt,
    timedOut: false,
    summary,
  };
}

function resolveDefaultRollbackSnapshot(index: AgencyAgentsSnapshotIndex) {
  if (index.snapshots.length === 0) return null;
  if (index.snapshots.length === 1) return index.snapshots[0] || null;
  return index.snapshots[index.snapshots.length - 2] || null;
}

export async function runAgencyAgentsRollback(input: {
  targetRoot: string;
  snapshotRoot: string;
  timeoutMs: number;
  snapshotId?: string;
  dryRun?: boolean;
}): Promise<AgencyAgentsRollbackResult> {
  if (!input.targetRoot || !input.snapshotRoot) {
    throw new Error("invalid_input: targetRoot and snapshotRoot are required");
  }

  const startedAt = Date.now();
  const summary = await withTimeout({
    timeoutMs: input.timeoutMs,
    timeoutMessage: `timeout: agency-agents rollback exceeded ${input.timeoutMs}ms`,
    operation: (async () => {
      const index = await readSnapshotIndex(input.snapshotRoot);
      const pointer = await readSnapshotPointer(input.snapshotRoot);
      const requestedSnapshotId = (input.snapshotId || "").trim();
      const chosen = requestedSnapshotId
        ? index.snapshots.find((entry) => entry.snapshotId === requestedSnapshotId) ||
          null
        : resolveDefaultRollbackSnapshot(index) || pointer;

      if (!chosen) {
        throw new Error(
          "snapshot_missing: no snapshots available for agency-agents rollback",
        );
      }

      if (!existsSync(chosen.snapshotPath)) {
        throw new Error(
          `snapshot_missing: snapshot path not found -> ${chosen.snapshotPath}`,
        );
      }

      const snapshotManifest =
        (await readManifest(chosen.snapshotPath)) ||
        (await buildAgencyAgentsManifest({
          rootPath: chosen.snapshotPath,
          profile: "all",
          selectedDirectories: [],
        }));

      if (!input.dryRun) {
        await rm(input.targetRoot, { recursive: true, force: true });
        await mkdir(input.targetRoot, { recursive: true });
        await cp(chosen.snapshotPath, input.targetRoot, {
          recursive: true,
          force: true,
          filter: (source) =>
            !shouldExcludeRelative(path.relative(chosen.snapshotPath, source)),
        });
        await writeManifest(input.targetRoot, {
          ...snapshotManifest,
          rootPath: input.targetRoot,
          generatedAt: new Date().toISOString(),
        });
      }

      return {
        targetRoot: input.targetRoot,
        dryRun: Boolean(input.dryRun),
        restoredSnapshot: chosen,
        manifestHash: snapshotManifest.hash,
        manifestPath: input.dryRun
          ? chosen.manifestPath
          : path.resolve(input.targetRoot, MANIFEST_FILE),
        fileCount: snapshotManifest.fileCount,
        markdownFiles: snapshotManifest.markdownFiles,
        topLevelDirectories: snapshotManifest.topLevelDirectories,
      } satisfies AgencyAgentsRollbackSummary;
    })(),
  });

  return {
    action: "rollback",
    durationMs: Date.now() - startedAt,
    timedOut: false,
    summary,
  };
}
