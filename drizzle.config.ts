import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/sqlite/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.SQLITE_PATH || "./data/openclaw.db",
  },
});
