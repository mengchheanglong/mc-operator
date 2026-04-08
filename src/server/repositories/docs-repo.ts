import fs from "fs";
import matter from "gray-matter";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import {
  findWorkspaceProject,
  getControlPlaneProjectId,
  toProjectStorageSlug,
} from "@/server/projects/workspace-projects";

export interface DocRow {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  titleNormalized: string;
  content: string;
  fileType: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocWithTags extends DocRow {
  tags: string[];
  scope: "project" | "shared";
}

interface StoredDocFile extends DocWithTags {
  filePath: string;
  storageScope: "project" | "shared";
}

const DOC_LIST_CACHE_TTL_MS = 10000;
const docListCache = new Map<
  string,
  {
    expiresAt: number;
    docs: StoredDocFile[];
  }
>();

function normTitle(title: string) {
  return normalizeDocumentTitle(title);
}

function getDefaultProjectId() {
  return getControlPlaneProjectId();
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getSharedKnowledgeDir(ensure = true): string {
  const configuredDir = process.env.OPENCLAW_SHARED_KNOWLEDGE_PATH || process.env.OPENCLAW_KNOWLEDGE_PATH;
  if (configuredDir) {
    const envDir = path.resolve(configuredDir);
    if (ensure) {
      ensureDir(envDir);
    }
    return envDir;
  }

  const repoDir = path.join(process.cwd(), "knowledge");
  const legacyDir = path.join(os.homedir(), ".openclaw", "knowledge");
  const repoExists = fs.existsSync(repoDir);
  const legacyExists = fs.existsSync(legacyDir);

  const dir = repoExists || !legacyExists ? repoDir : legacyDir;
  if (ensure) {
    ensureDir(dir);
  }
  return dir;
}

function getProjectKnowledgeDir(projectId: string, ensure = false): string {
  const project = findWorkspaceProject(projectId);
  if (!project) {
    return getSharedKnowledgeDir(ensure);
  }

  const dir = path.join(project.rootPath, ".openclaw", "knowledge");
  if (ensure) {
    ensureDir(dir);
  }
  return dir;
}

function parseDocFile(
  filePath: string,
  storageScope: "project" | "shared",
): StoredDocFile | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const id = String(data.id || "").trim();
    const userId = String(data.userId || "").trim();
    const projectId = String(data.projectId || getDefaultProjectId()).trim();
    const title = String(data.title || "").trim();
    const createdAt = String(data.createdAt || "").trim();
    const updatedAt = String(data.updatedAt || "").trim();
    const scope = data.scope === "shared" ? "shared" : "project";
    const tags = Array.isArray(data.tags)
      ? data.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];

    if (!id || !title) return null;

    return {
      id,
      userId,
      projectId,
      title,
      titleNormalized: normalizeDocumentTitle(title),
      content: parsed.content.trimStart(),
      fileType: filePath.endsWith(".md") ? ".md" : "",
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: updatedAt || new Date().toISOString(),
      tags,
      scope,
      filePath,
      storageScope,
    };
  } catch {
    return null;
  }
}

function stripFilePath(doc: StoredDocFile): DocWithTags {
  const { filePath: _filePath, storageScope: _storageScope, ...rest } = doc;
  return rest;
}

function buildDocFileName(doc: DocWithTags) {
  const scopePrefix =
    doc.scope === "shared"
      ? "shared"
      : toProjectStorageSlug(doc.projectId || getDefaultProjectId());
  const safeTitle = (doc.titleNormalized || doc.id.substring(0, 8))
    .replace(/[^a-z0-9_-]/gi, "-")
    .toLowerCase();
  return `${scopePrefix}__${safeTitle}.md`;
}

function writeDocFile(doc: DocWithTags, previousFilePath?: string): void {
  const dir =
    doc.scope === "shared"
      ? getSharedKnowledgeDir(true)
      : getProjectKnowledgeDir(doc.projectId || getDefaultProjectId(), true);
  const nextFilePath = path.join(dir, buildDocFileName(doc));

  const output = matter.stringify(doc.content, {
    id: doc.id,
    title: doc.title,
    userId: doc.userId,
    projectId: doc.projectId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    tags: doc.tags,
    scope: doc.scope,
  });

  if (
    previousFilePath &&
    previousFilePath !== nextFilePath &&
    fs.existsSync(previousFilePath)
  ) {
    fs.unlinkSync(previousFilePath);
  }

  fs.writeFileSync(nextFilePath, output, "utf-8");
}

function deleteDocFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function collectDocsFromDir(
  dir: string,
  storageScope: "project" | "shared",
): StoredDocFile[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".md"));
  const docs: StoredDocFile[] = [];

  for (const file of files) {
    const parsed = parseDocFile(path.join(dir, file), storageScope);
    if (parsed) {
      docs.push(parsed);
    }
  }

  return docs;
}

function getAllDocFiles(userId: string, projectId: string): StoredDocFile[] {
  const cacheKey = `${userId}:${projectId}`;
  const cached = docListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.docs;
  }

  const projectDocs = collectDocsFromDir(getProjectKnowledgeDir(projectId, false), "project");
  const sharedDocs = collectDocsFromDir(getSharedKnowledgeDir(false), "shared");
  const visibleDocs = [...projectDocs, ...sharedDocs].filter((doc) => {
    if (doc.userId !== userId) {
      return false;
    }

    if (doc.projectId === projectId) {
      return true;
    }

    return doc.scope === "shared";
  });

  const dedupedDocs = new Map<string, StoredDocFile>();
  for (const doc of visibleDocs) {
    const existing = dedupedDocs.get(doc.id);
    if (!existing || (existing.storageScope === "shared" && doc.storageScope === "project")) {
      dedupedDocs.set(doc.id, doc);
    }
  }

  const docs = Array.from(dedupedDocs.values()).sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

  docListCache.set(cacheKey, {
    expiresAt: Date.now() + DOC_LIST_CACHE_TTL_MS,
    docs,
  });

  return docs;
}

function findDocFileById(userId: string, projectId: string, id: string) {
  return getAllDocFiles(userId, projectId).find((doc) => doc.id === id);
}

function findDocFileByTitle(userId: string, projectId: string, title: string) {
  const normalized = normTitle(title);
  return getAllDocFiles(userId, projectId).find(
    (doc) => doc.titleNormalized === normalized,
  );
}

export function listDocs(userId: string, projectId: string): DocWithTags[] {
  return getAllDocFiles(userId, projectId).map(stripFilePath);
}

export function clearDocListCache(userId?: string, projectId?: string) {
  if (!userId || !projectId) {
    docListCache.clear();
    return;
  }

  docListCache.delete(`${userId}:${projectId}`);
}

export function findDocById(
  userId: string,
  projectId: string,
  id: string,
): DocWithTags | undefined {
  const doc = findDocFileById(userId, projectId, id);
  return doc ? stripFilePath(doc) : undefined;
}

export function findDocByTitle(
  userId: string,
  projectId: string,
  title: string,
): DocWithTags | undefined {
  const doc = findDocFileByTitle(userId, projectId, title);
  return doc ? stripFilePath(doc) : undefined;
}

export function searchDocs(
  userId: string,
  projectId: string,
  query: string,
  opts: { limit?: number; skip?: number; tag?: string; fileType?: string } = {},
): DocWithTags[] {
  let docs = getAllDocFiles(userId, projectId);

  if (opts.fileType) docs = docs.filter((doc) => doc.fileType === opts.fileType);
  if (opts.tag) {
    const normalizedTag = opts.tag.toLowerCase();
    docs = docs.filter((doc) => doc.tags.includes(normalizedTag));
  }
  if (query) {
    const normalizedQuery = query.toLowerCase();
    docs = docs.filter(
      (doc) =>
        doc.title.toLowerCase().includes(normalizedQuery) ||
        doc.content.toLowerCase().includes(normalizedQuery),
    );
  }

  const skip = opts.skip || 0;
  const limit = opts.limit || 50;
  return docs.slice(skip, skip + limit).map(stripFilePath);
}

export function countDocs(userId: string, projectId: string): number {
  return getAllDocFiles(userId, projectId).length;
}

export function topTags(
  userId: string,
  projectId: string,
  limit = 5,
): Array<{ tag: string; count: number }> {
  const docs = getAllDocFiles(userId, projectId);
  const tagCounts: Record<string, number> = {};

  for (const doc of docs) {
    for (const tag of doc.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  return Object.entries(tagCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

export function createDoc(
  userId: string,
  projectId: string,
  data: {
    title: string;
    content?: string;
    fileType?: string;
    tags?: string[];
    scope?: "project" | "shared";
  },
): DocWithTags {
  const titleNorm = normTitle(data.title);
  const existing = findDocFileByTitle(userId, projectId, data.title);
  if (existing) {
    throw new Error(`Document with title "${data.title}" already exists.`);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const newDoc: DocWithTags = {
    id,
    userId,
    projectId,
    title: data.title,
    titleNormalized: titleNorm,
    content: data.content || "",
    fileType: data.fileType || ".md",
    createdAt: now,
    updatedAt: now,
    tags: data.tags || [],
    scope: data.scope || "project",
  };

  writeDocFile(newDoc);
  clearDocListCache(userId, projectId);
  return newDoc;
}

export function updateDoc(
  userId: string,
  projectId: string,
  id: string,
  data: {
    title?: string;
    content?: string;
    tags?: string[];
    fileType?: string;
    scope?: "project" | "shared";
  },
): DocWithTags | null {
  const existing = findDocFileById(userId, projectId, id);
  if (!existing) return null;

  if (data.title && normTitle(data.title) !== existing.titleNormalized) {
    const duplicate = findDocFileByTitle(userId, projectId, data.title);
    if (duplicate && duplicate.id !== id) {
      throw new Error(`Document with title "${data.title}" already exists.`);
    }
  }

  const updatedDoc: DocWithTags = {
    ...existing,
    title: data.title ?? existing.title,
    titleNormalized: data.title ? normTitle(data.title) : existing.titleNormalized,
    content: data.content ?? existing.content,
    fileType: data.fileType ?? existing.fileType,
    tags: data.tags ?? existing.tags,
    scope: data.scope ?? existing.scope,
    updatedAt: new Date().toISOString(),
  };

  writeDocFile(updatedDoc, existing.filePath);
  clearDocListCache(userId, projectId);
  return updatedDoc;
}

export function deleteDoc(userId: string, projectId: string, id: string): boolean {
  const existing = findDocFileById(userId, projectId, id);
  if (!existing) return false;

  deleteDocFile(existing.filePath);
  clearDocListCache(userId, projectId);
  return true;
}
