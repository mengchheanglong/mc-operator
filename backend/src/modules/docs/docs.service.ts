import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { SqliteService } from "../../infra/sqlite/sqlite.service";
import { normalizeString } from "../../infra/service-utils";

type DocScope = "project" | "shared";

interface DocRecord {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  titleNormalized: string;
  content: string;
  fileType: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  scope: DocScope;
}

interface StoredDocRecord extends DocRecord {
  filePath: string;
  storageScope: DocScope;
}

const DEFAULT_PROJECT_ID = "mission-control";

function normalizeDocumentTitle(value: string) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\.(md|markdown)$/gi, "")
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toProjectStorageSlug(projectId: string) {
  return projectId.replace(/[\\/]/g, "__").replace(/[^a-zA-Z0-9._-]/g, "-");
}

function normalizeTags(values: unknown) {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function deriveTitleFromContent(content: string, fallback: string) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  return fallback;
}

function deriveStableDocId(filePath: string) {
  const digest = createHash("sha1").update(filePath).digest("hex").slice(0, 16);
  return `legacy-${digest}`;
}

@Injectable()
export class DocsService {
  constructor(private readonly sqlite: SqliteService) {}

  private s(value: unknown) {
    return normalizeString(value);
  }

  private ensureDir(targetPath: string) {
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
  }

  private resolveControlPlaneRoot() {
    const cwd = process.cwd();
    if (path.basename(cwd).toLowerCase() === "backend") {
      return path.resolve(cwd, "..");
    }
    return cwd;
  }

  private resolveWorkspaceRoot() {
    if (process.env.OPENCLAW_WORKSPACE_ROOT?.trim()) {
      return path.resolve(process.env.OPENCLAW_WORKSPACE_ROOT.trim());
    }

    const controlPlaneRoot = this.resolveControlPlaneRoot();
    const parent = path.resolve(controlPlaneRoot, "..");
    return fs.existsSync(parent) ? parent : controlPlaneRoot;
  }

  private resolveProjectId(projectId?: unknown) {
    return this.s(projectId) || DEFAULT_PROJECT_ID;
  }

  private resolveProjectRoot(projectId: string) {
    const workspaceRoot = this.resolveWorkspaceRoot();
    const candidate = path.resolve(workspaceRoot, projectId);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const controlPlaneRoot = this.resolveControlPlaneRoot();
    if (this.s(path.basename(controlPlaneRoot)) === projectId) {
      return controlPlaneRoot;
    }

    return path.resolve(workspaceRoot, DEFAULT_PROJECT_ID);
  }

  private resolveSharedKnowledgeDir(ensure: boolean) {
    const configuredPath =
      process.env.OPENCLAW_SHARED_KNOWLEDGE_PATH ||
      process.env.OPENCLAW_KNOWLEDGE_PATH;
    const configured = configuredPath?.trim()
      ? path.resolve(configuredPath.trim())
      : null;
    const controlPlaneKnowledge = path.join(this.resolveControlPlaneRoot(), "knowledge");
    const workspaceGlobalKnowledge = path.resolve(this.resolveWorkspaceRoot(), "..", "knowledge");

    const target =
      configured ||
      (fs.existsSync(controlPlaneKnowledge) ? controlPlaneKnowledge : workspaceGlobalKnowledge);

    if (ensure) this.ensureDir(target);
    return target;
  }

  private resolveProjectKnowledgeDir(projectId: string, ensure: boolean) {
    const projectRoot = this.resolveProjectRoot(projectId);
    const target = path.join(projectRoot, ".openclaw", "knowledge");
    if (ensure) this.ensureDir(target);
    return target;
  }

  private operator() {
    const latest = this.sqlite.connection
      .prepare(
        "SELECT id FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1",
      )
      .get() as Record<string, unknown> | undefined;
    if (latest) {
      return { id: this.s(latest.id) };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare(
        "INSERT INTO users (id, name, timezone, join_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, "Operator", "Asia/Bangkok", now, now, now);
    return { id };
  }

  private parseDocFile(filePath: string, storageScope: DocScope): StoredDocRecord | null {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;

      const content = parsed.content.trimStart();
      const fallbackTitle = path.basename(filePath).replace(/\.(md|markdown)$/i, "").trim();
      const title = this.s(data.title) || deriveTitleFromContent(content, fallbackTitle);
      if (!title) return null;

      const id = this.s(data.id) || deriveStableDocId(filePath);

      const userId = this.s(data.userId);
      const projectId = this.s(data.projectId) || DEFAULT_PROJECT_ID;
      const stats = fs.statSync(filePath);
      const createdAt = this.s(data.createdAt) || stats.birthtime.toISOString();
      const updatedAt = this.s(data.updatedAt) || stats.mtime.toISOString();
      const scope =
        data.scope === "shared" || data.scope === "project"
          ? data.scope
          : storageScope;

      return {
        id,
        userId,
        projectId,
        title,
        titleNormalized: normalizeDocumentTitle(title),
        content,
        fileType: filePath.endsWith(".md") ? ".md" : "",
        createdAt,
        updatedAt,
        tags: normalizeTags(data.tags),
        scope,
        filePath,
        storageScope,
      };
    } catch {
      return null;
    }
  }

  private collectDocsFromDir(targetDir: string, storageScope: DocScope) {
    if (!fs.existsSync(targetDir)) return [] as StoredDocRecord[];
    const files = fs.readdirSync(targetDir).filter((file) => file.endsWith(".md"));
    const docs: StoredDocRecord[] = [];
    for (const file of files) {
      const parsed = this.parseDocFile(path.join(targetDir, file), storageScope);
      if (parsed) docs.push(parsed);
    }
    return docs;
  }

  private listVisibleStoredDocs(userId: string, projectId: string) {
    const projectDocs = this.collectDocsFromDir(
      this.resolveProjectKnowledgeDir(projectId, false),
      "project",
    );
    const sharedDocs = this.collectDocsFromDir(
      this.resolveSharedKnowledgeDir(false),
      "shared",
    );

    const visible = [...projectDocs, ...sharedDocs].filter((doc) => {
      if (doc.userId && doc.userId !== userId) return false;
      if (doc.projectId === projectId) return true;
      return doc.scope === "shared";
    });

    // Prefer project-scoped docs if duplicate ids exist in shared.
    const deduped = new Map<string, StoredDocRecord>();
    for (const doc of visible) {
      const existing = deduped.get(doc.id);
      if (!existing || (existing.storageScope === "shared" && doc.storageScope === "project")) {
        deduped.set(doc.id, doc);
      }
    }

    return Array.from(deduped.values()).sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  }

  private stripStoredMeta(doc: StoredDocRecord): DocRecord {
    const { filePath: _filePath, storageScope: _storageScope, ...record } = doc;
    return record;
  }

  private findStoredById(userId: string, projectId: string, id: string) {
    return this.listVisibleStoredDocs(userId, projectId).find((doc) => doc.id === id);
  }

  private findStoredByTitle(userId: string, projectId: string, title: string) {
    const normalizedTitle = normalizeDocumentTitle(title);
    return this.listVisibleStoredDocs(userId, projectId).find(
      (doc) => doc.titleNormalized === normalizedTitle,
    );
  }

  private buildDocFileName(record: DocRecord) {
    const scopePrefix =
      record.scope === "shared"
        ? "shared"
        : toProjectStorageSlug(record.projectId || DEFAULT_PROJECT_ID);
    const safeTitle = (record.titleNormalized || record.id.slice(0, 8))
      .replace(/[^a-z0-9_-]/gi, "-")
      .toLowerCase();
    return `${scopePrefix}__${safeTitle}.md`;
  }

  private writeDocFile(record: DocRecord, previousFilePath?: string) {
    const targetDir =
      record.scope === "shared"
        ? this.resolveSharedKnowledgeDir(true)
        : this.resolveProjectKnowledgeDir(record.projectId || DEFAULT_PROJECT_ID, true);
    const nextFilePath = path.join(targetDir, this.buildDocFileName(record));

    const serialized = matter.stringify(record.content, {
      id: record.id,
      title: record.title,
      userId: record.userId,
      projectId: record.projectId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      tags: record.tags,
      scope: record.scope,
    });

    if (
      previousFilePath &&
      previousFilePath !== nextFilePath &&
      fs.existsSync(previousFilePath)
    ) {
      fs.unlinkSync(previousFilePath);
    }

    fs.writeFileSync(nextFilePath, serialized, "utf8");
  }

  list(input: {
    projectId?: unknown;
    search?: unknown;
    tag?: unknown;
    fileType?: unknown;
    limit?: unknown;
    skip?: unknown;
  }) {
    const operator = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const search = this.s(input.search).toLowerCase();
    const tag = this.s(input.tag).toLowerCase();
    const fileType = this.s(input.fileType);

    const parsedLimit = Number.parseInt(this.s(input.limit) || "50", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 100))
      : 50;
    const parsedSkip = Number.parseInt(this.s(input.skip) || "0", 10);
    const skip = Number.isFinite(parsedSkip) ? Math.max(0, parsedSkip) : 0;

    let docs = this.listVisibleStoredDocs(operator.id, projectId).map((doc) =>
      this.stripStoredMeta(doc),
    );

    if (fileType) {
      docs = docs.filter((doc) => doc.fileType === fileType);
    }
    if (tag) {
      docs = docs.filter((doc) => doc.tags.includes(tag));
    }
    if (search) {
      docs = docs.filter(
        (doc) =>
          doc.title.toLowerCase().includes(search) ||
          doc.content.toLowerCase().includes(search),
      );
    }

    return docs.slice(skip, skip + limit);
  }

  findById(input: { projectId?: unknown; id?: unknown }) {
    const operator = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Document ID is required.");
    }
    const found = this.findStoredById(operator.id, projectId, id);
    return found ? this.stripStoredMeta(found) : null;
  }

  create(input: {
    projectId?: unknown;
    title?: unknown;
    content?: unknown;
    tags?: unknown;
    fileType?: unknown;
    scope?: unknown;
  }) {
    const operator = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const title = this.s(input.title);
    if (!title) {
      throw new BadRequestException("Document title is required.");
    }
    if (title.length > 200) {
      throw new BadRequestException("Title must be 200 characters or less.");
    }

    const duplicate = this.findStoredByTitle(operator.id, projectId, title);
    if (duplicate) {
      throw new BadRequestException(`Document with title "${title}" already exists.`);
    }

    const now = new Date().toISOString();
    const record: DocRecord = {
      id: randomUUID(),
      userId: operator.id,
      projectId,
      title,
      titleNormalized: normalizeDocumentTitle(title),
      content: String(input.content || "").slice(0, 50_000),
      fileType: this.s(input.fileType) || ".md",
      createdAt: now,
      updatedAt: now,
      tags: normalizeTags(input.tags),
      scope: input.scope === "shared" ? "shared" : "project",
    };

    this.writeDocFile(record);
    return record;
  }

  update(input: {
    projectId?: unknown;
    id?: unknown;
    title?: unknown;
    content?: unknown;
    tags?: unknown;
    fileType?: unknown;
    scope?: unknown;
  }) {
    const operator = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Document ID is required.");
    }

    const existing = this.findStoredById(operator.id, projectId, id);
    if (!existing) {
      return null;
    }

    const updateTitleProvided = input.title !== undefined;
    const title = updateTitleProvided ? this.s(input.title) : existing.title;
    if (updateTitleProvided && !title) {
      throw new BadRequestException("Title cannot be empty.");
    }
    if (title.length > 200) {
      throw new BadRequestException("Title must be 200 characters or less.");
    }

    if (updateTitleProvided) {
      const duplicate = this.findStoredByTitle(operator.id, projectId, title);
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException(`Document with title "${title}" already exists.`);
      }
    }

    const next: DocRecord = {
      ...this.stripStoredMeta(existing),
      title,
      titleNormalized: normalizeDocumentTitle(title),
      content:
        input.content === undefined
          ? existing.content
          : String(input.content || "").slice(0, 50_000),
      tags: input.tags === undefined ? existing.tags : normalizeTags(input.tags),
      fileType: input.fileType === undefined ? existing.fileType : this.s(input.fileType),
      scope: input.scope === undefined ? existing.scope : input.scope === "shared" ? "shared" : "project",
      updatedAt: new Date().toISOString(),
    };

    this.writeDocFile(next, existing.filePath);
    return next;
  }

  delete(input: { projectId?: unknown; id?: unknown }) {
    const operator = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Document ID is required.");
    }

    const existing = this.findStoredById(operator.id, projectId, id);
    if (!existing) {
      return false;
    }

    if (fs.existsSync(existing.filePath)) {
      fs.unlinkSync(existing.filePath);
    }
    return true;
  }
}
