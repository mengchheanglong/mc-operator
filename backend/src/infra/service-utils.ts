/**
 * Shared utility functions used across multiple backend services.
 *
 * Extracted to eliminate duplication of s(), resolveProjectId(),
 * parseJsonField(), and operator() patterns that were repeated
 * across 10+ services.
 */

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

const DEFAULT_PROJECT_ID = "mc-operator";

/** Trim + coerce unknown to string. Drop-in replacement for per-service `s()`. */
export function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

/** Resolve projectId with fallback to default. */
export function resolveProjectId(projectId?: unknown): string {
  return normalizeString(projectId) || DEFAULT_PROJECT_ID;
}

/** Safely parse a JSON string field into an object. Returns `{}` on failure. */
export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Safely parse a JSON string field into an array. Returns `[]` on failure. */
export function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Find or create the default operator user.
 * Consolidates the `operator()` pattern used in 7+ services.
 */
export function resolveOperator(db: Database.Database): { id: string } {
  const latest = db
    .prepare(
      "SELECT id FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1",
    )
    .get() as Record<string, unknown> | undefined;

  if (latest) {
    return { id: normalizeString(latest.id) };
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO users (id, name, timezone, join_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, "Operator", "Asia/Bangkok", now, now, now);

  return { id };
}
