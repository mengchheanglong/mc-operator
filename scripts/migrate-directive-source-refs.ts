import { eq } from "drizzle-orm";
import { db } from "@/server/sqlite/db";
import { directiveCapabilities } from "@/server/sqlite/schema";

const LEGACY_PREFIX = "agent-lab/";
const TARGET_PREFIX = "directive-workspace/discovery/agent-lab-extraction/";

function toDirectiveOwnedSourceRef(sourceRef: string) {
  const normalized = String(sourceRef || "").trim().replace(/^[/\\]+/, "");
  if (normalized.startsWith("directive-workspace/")) {
    return normalized;
  }
  if (normalized.startsWith(LEGACY_PREFIX)) {
    return `${TARGET_PREFIX}${normalized.slice(LEGACY_PREFIX.length)}`;
  }
  return normalized;
}

function main() {
  const now = new Date().toISOString();
  const dryRun = process.argv.includes("--dry-run");

  const rows = db
    .select({
      id: directiveCapabilities.id,
      sourceRef: directiveCapabilities.sourceRef,
    })
    .from(directiveCapabilities)
    .all();

  const migrations = rows
    .map((row) => ({
      id: row.id,
      before: row.sourceRef,
      after: toDirectiveOwnedSourceRef(row.sourceRef),
    }))
    .filter((row) => row.before !== row.after);

  if (!dryRun) {
    for (const migration of migrations) {
      db.update(directiveCapabilities)
        .set({
          sourceRef: migration.after,
          updatedAt: now,
        })
        .where(eq(directiveCapabilities.id, migration.id))
        .run();
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        dryRun,
        scanned: rows.length,
        migrated: migrations.length,
        samples: migrations.slice(0, 20),
      },
      null,
      2,
    )}\n`,
  );
}

main();
