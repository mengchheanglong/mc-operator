import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Adventurer"),
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  joinDate: text("join_date").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const quests = sqliteTable(
  "quests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    goal: text("goal").notNull(),
    difficulty: text("difficulty").notNull().default("normal"),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    date: text("date").notNull(),
    completedDate: text("completed_date"),
  },
  (table) => [
    index("quests_user_project_status_date").on(
      table.userId,
      table.projectId,
      table.completed,
      table.date,
    ),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    content: text("content").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("notes_user_project_status_updated").on(
      table.userId,
      table.projectId,
      table.completed,
      table.updatedAt,
    ),
  ],
);

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    projectId: text("project_id").notNull().default("mission-control"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull().default("system"),
    status: text("status").notNull().default("info"),
    source: text("source").notNull().default("OpenClaw"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    date: text("date").notNull(),
  },
  (table) => [index("reports_user_project_date").on(table.userId, table.projectId, table.date)],
);
