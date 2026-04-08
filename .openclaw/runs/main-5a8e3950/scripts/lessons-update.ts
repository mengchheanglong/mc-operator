import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  readInjectionTelemetryRows,
  readLessonRuleCatalog,
} from "../src/server/repositories/workflow-lessons-repo.ts";
import { updateWorkflowLessonRules } from "../src/server/services/workflow-lessons-service.ts";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureDir(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function appendDailyDelta(root: string, promoted: string[], deprecated: string[]) {
  const dailyPath = path.join(root, "reports", "lessons", `daily-${todayKey()}.md`);
  await ensureDir(dailyPath);
  let prior = "";
  try {
    prior = await readFile(dailyPath, "utf8");
  } catch {
    prior = `# Lessons Daily Delta (${todayKey()})\n\n`;
  }
  const line = `- ${new Date().toISOString()} promoted=${promoted.length} deprecated=${deprecated.length}${promoted.length > 0 ? ` promoted_ids=${promoted.join(",")}` : ""}${deprecated.length > 0 ? ` deprecated_ids=${deprecated.join(",")}` : ""}\n`;
  await writeFile(dailyPath, `${prior}${line}`, "utf8");
}

async function main() {
  const root = process.cwd();
  const snapshot = await updateWorkflowLessonRules({
    projectPath: root,
    promotionThreshold: 2,
    maxCatalogItems: 200,
  });
  const catalog = await readLessonRuleCatalog(root);
  const telemetry = await readInjectionTelemetryRows(root);

  const latestPath = path.join(root, "reports", "lessons", "latest.json");
  const injectionPath = path.join(root, "reports", "lessons", "injection-latest.json");

  await ensureDir(latestPath);
  await ensureDir(injectionPath);

  const latest = {
    ok: true,
    generatedAt: snapshot.generatedAt,
    promotionThreshold: snapshot.promotionThreshold,
    totals: {
      eventsConsidered: snapshot.items.reduce((sum, item) => sum + item.count, 0),
      candidate: snapshot.candidate.length,
      active: snapshot.active.length,
      deprecated: snapshot.deprecated.length,
    },
    promoted: snapshot.promoted.map((r) => ({ id: r.id, pattern: r.pattern })),
    deprecated: snapshot.deprecated.map((r) => ({ id: r.id, pattern: r.pattern })),
    catalog: catalog?.items || [],
  };

  const telemetryLatest = {
    ok: true,
    generatedAt: new Date().toISOString(),
    totalRows: telemetry.length,
    latest: telemetry.slice(-20),
  };

  await writeFile(latestPath, `${JSON.stringify(latest, null, 2)}\n`, "utf8");
  await writeFile(injectionPath, `${JSON.stringify(telemetryLatest, null, 2)}\n`, "utf8");
  await appendDailyDelta(root, snapshot.promoted.map((r) => r.id), snapshot.deprecated.map((r) => r.id));

  process.stdout.write(`${JSON.stringify({ ok: true, latestPath, injectionPath, promoted: snapshot.promoted.length, deprecated: snapshot.deprecated.length }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
