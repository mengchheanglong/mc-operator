import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type LessonOutcome = "failure" | "retry" | "manual_correction" | "success";
export type LessonRunType = "agent" | "automation" | "quest";

export interface LessonEventRow {
  ts: string;
  issueKey: string;
  runType: LessonRunType;
  outcome: LessonOutcome;
  summary: string;
}

export interface LessonRuleCatalogItem {
  id: string;
  pattern: string;
  trigger: string;
  prevention: string;
  verification: string;
  runType: LessonRunType;
  issueKey: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: "candidate" | "active" | "deprecated";
  sourceSummaries: string[];
}

export interface LessonRuleCatalog {
  version: 1;
  generatedAt: string;
  sourceFile: string;
  promotionThreshold: number;
  maxCatalogItems: number;
  items: LessonRuleCatalogItem[];
}

function lessonsDir(projectPath: string) {
  return path.join(projectPath, ".openclaw", "lessons");
}

export function lessonEventsPath(projectPath: string) {
  return path.join(lessonsDir(projectPath), "workflow-lessons.jsonl");
}

export function lessonCatalogPath(projectPath: string) {
  return path.join(lessonsDir(projectPath), "workflow-rules.json");
}

export function lessonInjectionTelemetryPath(projectPath: string) {
  return path.join(lessonsDir(projectPath), "runtime-injection-telemetry.jsonl");
}

async function ensureDir(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function appendLessonEventRow(projectPath: string, row: LessonEventRow) {
  const file = lessonEventsPath(projectPath);
  await ensureDir(file);
  await appendFile(file, `${JSON.stringify(row)}\n`, "utf8");
}

export async function readLessonEventRows(projectPath: string): Promise<LessonEventRow[]> {
  const file = lessonEventsPath(projectPath);
  try {
    const raw = await readFile(file, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Partial<LessonEventRow>;
        } catch {
          return null;
        }
      })
      .filter((row): row is Partial<LessonEventRow> => Boolean(row))
      .map((row) => {
        const runType: LessonRunType = row.runType === "automation" || row.runType === "quest" ? row.runType : "agent";
        const outcome: LessonOutcome =
          row.outcome === "failure" || row.outcome === "retry" || row.outcome === "manual_correction" ? row.outcome : "success";
        return {
          ts: String(row.ts || "").trim(),
          issueKey: String(row.issueKey || "").trim(),
          runType,
          outcome,
          summary: String(row.summary || "").trim(),
        };
      })
      .filter((row) => row.ts && row.issueKey && row.summary);
  } catch {
    return [];
  }
}

export async function readLessonRuleCatalog(projectPath: string): Promise<LessonRuleCatalog | null> {
  try {
    const raw = await readFile(lessonCatalogPath(projectPath), "utf8");
    const parsed = JSON.parse(raw) as LessonRuleCatalog;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeLessonRuleCatalog(projectPath: string, catalog: LessonRuleCatalog) {
  const file = lessonCatalogPath(projectPath);
  await ensureDir(file);
  await writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

export async function appendLessonInjectionTelemetryRow(projectPath: string, row: Record<string, unknown>) {
  const file = lessonInjectionTelemetryPath(projectPath);
  await ensureDir(file);
  await appendFile(file, `${JSON.stringify(row)}\n`, "utf8");
}

export async function readInjectionTelemetryRows(projectPath: string) {
  const file = lessonInjectionTelemetryPath(projectPath);
  try {
    const raw = await readFile(file, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((row): row is Record<string, unknown> => Boolean(row));
  } catch {
    return [];
  }
}
