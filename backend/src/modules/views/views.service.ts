import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SqliteService } from "../../infra/sqlite/sqlite.service";
import {
  normalizeString,
  resolveOperator,
  resolveProjectId as resolveProjectIdUtil,
} from "../../infra/service-utils";

type SavedViewSurface = "quests" | "reports";

interface SavedViewRow {
  id: string;
  userId: string;
  projectId: string;
  surface: SavedViewSurface;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ViewsService {
  constructor(private readonly sqlite: SqliteService) {}

  private s(value: unknown) {
    return normalizeString(value);
  }

  private operator() {
    return resolveOperator(this.sqlite.connection);
  }

  private projectId(value?: unknown) {
    return resolveProjectIdUtil(value);
  }

  private surface(value: unknown): SavedViewSurface {
    const normalized = this.s(value);
    if (normalized === "quests" || normalized === "reports") {
      return normalized;
    }
    throw new BadRequestException("Surface is required.");
  }

  private parseFilters(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private toSavedViewRow(raw: Record<string, unknown>): SavedViewRow {
    let filters: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(raw.filters_json || "{}"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        filters = parsed as Record<string, unknown>;
      }
    } catch {
      filters = {};
    }

    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      surface: this.surface(raw.surface),
      name: this.s(raw.name),
      filters,
      createdAt: this.s(raw.created_at),
      updatedAt: this.s(raw.updated_at),
    };
  }

  list(projectId?: unknown, surface?: unknown) {
    const user = this.operator();
    const pid = this.projectId(projectId);
    const normalizedSurface = this.surface(surface);
    const rows = this.sqlite.connection
      .prepare(
        "SELECT * FROM saved_views WHERE user_id = ? AND project_id = ? AND surface = ? ORDER BY updated_at DESC, created_at DESC LIMIT 500",
      )
      .all(user.id, pid, normalizedSurface) as Array<Record<string, unknown>>;
    return rows.map((row) => this.toSavedViewRow(row));
  }

  create(input: {
    projectId?: unknown;
    surface?: unknown;
    name?: unknown;
    filters?: unknown;
  }) {
    const user = this.operator();
    const pid = this.projectId(input.projectId);
    const surface = this.surface(input.surface);
    const name = this.s(input.name);
    if (!name) {
      throw new BadRequestException("View name is required.");
    }
    const filters = this.parseFilters(input.filters);
    const id = randomUUID();
    const now = new Date().toISOString();

    this.sqlite.connection
      .prepare(
        "INSERT INTO saved_views (id, user_id, project_id, surface, name, filters_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, user.id, pid, surface, name, JSON.stringify(filters), now, now);

    const created = this.sqlite.connection
      .prepare("SELECT * FROM saved_views WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1")
      .get(user.id, pid, id) as Record<string, unknown> | undefined;
    if (!created) {
      throw new BadRequestException("Failed to create saved view.");
    }

    return this.toSavedViewRow(created);
  }

  delete(input: { projectId?: unknown; id?: unknown }) {
    const user = this.operator();
    const pid = this.projectId(input.projectId);
    const id = this.s(input.id);
    if (!id) {
      throw new BadRequestException("Saved view ID is required.");
    }

    const existing = this.sqlite.connection
      .prepare("SELECT id FROM saved_views WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1")
      .get(user.id, pid, id) as { id?: string } | undefined;
    if (!existing) {
      throw new NotFoundException("Saved view not found.");
    }

    this.sqlite.connection
      .prepare("DELETE FROM saved_views WHERE user_id = ? AND project_id = ? AND id = ?")
      .run(user.id, pid, id);
    return true;
  }
}
