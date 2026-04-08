import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

const dbPath = path.resolve(process.cwd(), "data", "openclaw.db");
console.log(`Connecting to DB: ${dbPath}`);
const sqlite = new Database(dbPath);

const getKnowledgeDir = () => {
  if (process.env.OPENCLAW_KNOWLEDGE_PATH) {
    const envDir = path.resolve(process.env.OPENCLAW_KNOWLEDGE_PATH);
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
    }
    return envDir;
  }

  const repoDir = path.join(process.cwd(), "knowledge");
  const legacyDir = path.join(os.homedir(), ".openclaw", "knowledge");
  const dir = fs.existsSync(repoDir) || !fs.existsSync(legacyDir) ? repoDir : legacyDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

interface DocRow {
  id: string;
  userId: string;
  title: string;
  titleNormalized: string;
  content: string;
  fileType: string;
  createdAt: string;
  updatedAt: string;
}

function runMigration() {
  const knowledgeDir = getKnowledgeDir();
  console.log(`Knowledge directory: ${knowledgeDir}`);

  const docs = sqlite.prepare(`
    SELECT
      id,
      user_id as userId,
      title,
      title_normalized as titleNormalized,
      content,
      file_type as fileType,
      created_at as createdAt,
      updated_at as updatedAt
    FROM docs
  `).all() as DocRow[];
  console.log(`Found ${docs.length} documents to migrate.`);

  let migratedCount = 0;

  for (const doc of docs) {
    const tags = sqlite
      .prepare("SELECT tag FROM doc_tags WHERE doc_id = ?")
      .all(doc.id) as { tag: string }[];
    const tagArray = tags.map((t) => t.tag);

    const safeTitle = doc.titleNormalized.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const fileName = `${safeTitle}.md`;
    const filePath = path.join(knowledgeDir, fileName);

    const frontmatter = [
      "---",
      `id: "${doc.id}"`,
      `title: "${doc.title.replace(/"/g, '\\"')}"`,
      `userId: "${doc.userId}"`,
      `createdAt: "${doc.createdAt}"`,
      `updatedAt: "${doc.updatedAt}"`,
      `tags: [${tagArray.map(t => `"${t}"`).join(", ")}]`,
      "---",
      "",
      doc.content
    ].join("\n");

    fs.writeFileSync(filePath, frontmatter, "utf-8");
    migratedCount++;
    console.log(`Migrated: ${doc.title} -> ${fileName}`);
  }

  console.log(`Migration complete. ${migratedCount} docs written to ${knowledgeDir}`);
}

runMigration();
