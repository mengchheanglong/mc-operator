// ---------------------------------------------------------------------------
// Users Repository — SQLite / Drizzle
// ---------------------------------------------------------------------------

import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/server/sqlite/db";
import { users } from "@/server/sqlite/schema";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  name: string;
  timezone: string;
  joinDate: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function findUserById(id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

/** Return the most recently updated user, or undefined. */
export function findLatestUser(): UserRow | undefined {
  return db
    .select()
    .from(users)
    .orderBy(desc(users.updatedAt), desc(users.createdAt))
    .limit(1)
    .get();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Ensure a user exists — create one if the table is empty. */
export function findOrCreateUser(): UserRow {
  const existing = findLatestUser();
  if (existing) return existing;

  const now = new Date().toISOString();
  const id = randomUUID();

  db.insert(users)
    .values({
      id,
      name: "Operator",
      timezone: "Asia/Bangkok",
      joinDate: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    name: "Operator",
    timezone: "Asia/Bangkok",
    joinDate: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateUser(
  id: string,
  data: Partial<Pick<UserRow, "name" | "timezone">>,
): UserRow | null {
  const existing = findUserById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.update(users)
    .set({ ...data, updatedAt: now })
    .where(eq(users.id, id))
    .run();

  return { ...existing, ...data, updatedAt: now };
}
