import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SqliteService } from "../../infra/sqlite/sqlite.service";
import {
  normalizeString,
  resolveOperator,
  resolveProjectId as resolveProjectIdUtil,
} from "../../infra/service-utils";

interface NoteRow {
  id: string;
  userId: string;
  projectId: string;
  content: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class NotesService {
  constructor(private readonly sqlite: SqliteService) {
    this.initializeSchema();
  }

  private initializeSchema() {
    this.sqlite.connection.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id),
        project_id text NOT NULL DEFAULT 'mission-control',
        content text NOT NULL,
        completed integer NOT NULL DEFAULT 0,
        created_at text NOT NULL,
        updated_at text NOT NULL
      );
    `);
  }

  private s(value: unknown) {
    return normalizeString(value);
  }

  private operator() {
    return resolveOperator(this.sqlite.connection);
  }

  private resolveProjectId(projectId?: unknown) {
    return resolveProjectIdUtil(projectId);
  }

  private toNoteRow(raw: Record<string, unknown>): NoteRow {
    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      content: this.s(raw.content),
      completed: Boolean(raw.completed),
      createdAt: this.s(raw.created_at),
      updatedAt: this.s(raw.updated_at),
    };
  }

  private findNoteById(userId: string, projectId: string, id: string) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT * FROM notes WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1",
      )
      .get(userId, projectId, id) as Record<string, unknown> | undefined;
    return row ? this.toNoteRow(row) : undefined;
  }

  list(projectId?: unknown) {
    const user = this.operator();
    const pid = this.resolveProjectId(projectId);
    const rows = this.sqlite.connection
      .prepare(
        "SELECT * FROM notes WHERE user_id = ? AND project_id = ? ORDER BY updated_at DESC, created_at DESC, id DESC",
      )
      .all(user.id, pid) as Array<Record<string, unknown>>;
    return rows.map((row) => this.toNoteRow(row));
  }

  create(input: { projectId?: unknown; content?: unknown }) {
    const user = this.operator();
    const pid = this.resolveProjectId(input.projectId);
    const content = this.s(input.content);

    if (!content) {
      throw new BadRequestException("Note content is required.");
    }
    if (content.length > 500) {
      throw new BadRequestException("Note content must be 500 characters or less.");
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare(
        "INSERT INTO notes (id, user_id, project_id, content, completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, user.id, pid, content, 0, now, now);

    const row = this.findNoteById(user.id, pid, id);
    if (!row) {
      throw new BadRequestException("Failed to create note.");
    }

    return row;
  }

  update(
    input: {
      projectId?: unknown;
      id?: unknown;
      content?: unknown;
      completed?: unknown;
    },
  ) {
    const user = this.operator();
    const pid = this.resolveProjectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Note ID is required.");
    }

    const existing = this.findNoteById(user.id, pid, id);
    if (!existing) {
      return null;
    }

    const updateData: Record<string, unknown> = {};
    if (input.content !== undefined) {
      const content = this.s(input.content);
      if (!content) {
        throw new BadRequestException("Note content cannot be empty.");
      }
      if (content.length > 500) {
        throw new BadRequestException("Note content must be 500 characters or less.");
      }
      updateData.content = content;
    }
    if (input.completed !== undefined) {
      updateData.completed = Boolean(input.completed) ? 1 : 0;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException("No valid fields provided for update.");
    }

    const now = new Date().toISOString();
    this.sqlite.connection
      .prepare(
        "UPDATE notes SET content = COALESCE(?, content), completed = COALESCE(?, completed), updated_at = ? WHERE user_id = ? AND project_id = ? AND id = ?",
      )
      .run(
        updateData.content ?? null,
        updateData.completed ?? null,
        now,
        user.id,
        pid,
        id,
      );

    const row = this.findNoteById(user.id, pid, id);
    return row;
  }

  delete(input: { projectId?: unknown; id?: unknown }) {
    const user = this.operator();
    const pid = this.resolveProjectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Note ID is required.");
    }

    const result = this.sqlite.connection
      .prepare("DELETE FROM notes WHERE user_id = ? AND project_id = ? AND id = ?")
      .run(user.id, pid, id);
    return result.changes > 0;
  }
}
