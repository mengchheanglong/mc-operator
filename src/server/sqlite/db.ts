import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "@/server/sqlite/schema";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";

// ---------------------------------------------------------------------------
// Resolve DB path and ensure parent directory exists
// ---------------------------------------------------------------------------

const dbPath = path.resolve(
  process.env.SQLITE_PATH || path.join(process.cwd(), "data", "openclaw.db"),
);

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Open SQLite connection with required pragmas
// ---------------------------------------------------------------------------

const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");

function ensureColumn(tableName: string, columnName: string, columnSql: string) {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  if (rows.some((row) => row.name === columnName)) {
    return;
  }

  sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
}

function ensureIndex(indexName: string, sqlStatement: string) {
  const existing = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
    )
    .get(indexName);

  if (!existing) {
    sqlite.exec(sqlStatement);
  }
}

function ensureProjectScopedTables() {
  const defaultProjectId = getControlPlaneProjectId();
  const escapedDefaultProjectId = defaultProjectId.replace(/'/g, "''");

  ensureColumn(
    "quests",
    "project_id",
    `project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}'`,
  );
  ensureColumn(
    "notes",
    "project_id",
    `project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}'`,
  );
  ensureColumn(
    "reports",
    "project_id",
    `project_id text NOT NULL DEFAULT '${escapedDefaultProjectId}'`,
  );

  ensureIndex(
    "quests_user_project_status_date",
    "CREATE INDEX quests_user_project_status_date ON quests (user_id, project_id, completed, date)",
  );
  ensureIndex(
    "notes_user_project_status_updated",
    "CREATE INDEX notes_user_project_status_updated ON notes (user_id, project_id, completed, updated_at)",
  );
  ensureIndex(
    "reports_user_project_date",
    "CREATE INDEX reports_user_project_date ON reports (user_id, project_id, date)",
  );
}

ensureProjectScopedTables();

// ---------------------------------------------------------------------------
// Drizzle client
// ---------------------------------------------------------------------------

export const db = drizzle(sqlite, { schema });
export { sqlite };
