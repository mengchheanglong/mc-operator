import {
  appendLessonEventRow,
  appendLessonInjectionTelemetryRow,
  readLessonEventRows,
  readLessonRuleCatalog,
  writeLessonRuleCatalog,
  type LessonEventRow,
  type LessonRunType,
  type LessonRuleCatalog,
  type LessonRuleCatalogItem,
} from "../repositories/workflow-lessons-repo.ts";

interface LessonEventInput {
  projectPath: string;
  runType: LessonRunType;
  issueKey: string;
  summary: string;
  outcome: "failure" | "retry" | "manual_correction" | "success";
}

export interface LessonHint {
  issueKey: string;
  count: number;
  reanalysisRequired: boolean;
  snippets: string[];
  ruleSnippets: string[];
  telemetry: {
    source: string;
    snippetsInjected: number;
    rulesInjected: number;
    charsInjected: number;
    ruleSources: string[];
    budgetChars: number;
    budgetExceeded: boolean;
  };
}

export interface WorkflowLessonRulesSnapshot extends LessonRuleCatalog {}

const DEFAULT_PROMOTION_THRESHOLD = 2;
const DEFAULT_MAX_CATALOG_ITEMS = 200;
const DEFAULT_INJECTION_RULE_LIMIT = 3;
const DEFAULT_INJECTION_CHAR_BUDGET = 480;

function compact(value: string, maxChars: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}...`;
}

function normalizeSummary(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function derivePattern(summary: string) {
  const normalized = normalizeSummary(summary);
  if (normalized.includes("timeout")) return "timeout_failure";
  if (normalized.includes("delivery") || normalized.includes("dispatch failed")) return "delivery_failure";
  if (normalized.includes("guard") || normalized.includes("blocked")) return "guard_block";
  return normalized.slice(0, 80) || "generic_failure";
}

function normalizeLesson(summary: string) {
  const clean = compact(summary, 320);
  const lower = clean.toLowerCase();
  const pattern = derivePattern(clean);
  const trigger = compact(clean, 140);
  const prevention = lower.includes("timeout")
    ? "Add bounded retries, preflight checks, and fallback path before rerunning."
    : lower.includes("delivery") || lower.includes("dispatch")
      ? "Verify routing/channel health and capture actionable error details before retry."
      : lower.includes("guard") || lower.includes("blocked")
        ? "Adjust objective/constraints to avoid duplicate or blocked execution paths."
        : "Convert repeated failure into a small deterministic change before rerun.";
  const verification = lower.includes("timeout")
    ? "Show successful retry with timing evidence and final status."
    : "Provide command/log evidence that the failure condition no longer occurs.";
  return { pattern, trigger, prevention: compact(prevention, 180), verification: compact(verification, 180) };
}

function toInstruction(item: LessonRuleCatalogItem) {
  return compact(`Pattern: ${item.pattern}. Prevention: ${item.prevention} Verification: ${item.verification}`, 220);
}

function scoreRule(item: LessonRuleCatalogItem, issueKey: string) {
  if (item.issueKey === issueKey) return 1000 + item.count;
  const a = issueKey.split(":")[0] || "";
  const b = item.issueKey.split(":")[0] || "";
  if (a && a === b) return 300 + item.count;
  return item.count;
}

function deterministicTimestamp(rows: LessonEventRow[]) {
  if (rows.length === 0) return "1970-01-01T00:00:00.000Z";
  return [...rows].sort((a, b) => a.ts.localeCompare(b.ts))[rows.length - 1]?.ts || "1970-01-01T00:00:00.000Z";
}

export async function appendLessonEvent(input: LessonEventInput) {
  await appendLessonEventRow(input.projectPath, {
    ts: new Date().toISOString(),
    issueKey: input.issueKey,
    runType: input.runType,
    outcome: input.outcome,
    summary: compact(input.summary, 400),
  });
}

export async function updateWorkflowLessonRules(input: {
  projectPath: string;
  maxCatalogItems?: number;
  promotionThreshold?: number;
}) {
  const rows = await readLessonEventRows(input.projectPath);
  const previous = await readLessonRuleCatalog(input.projectPath);
  const promotionThreshold = Math.max(2, Math.min(6, Number(input.promotionThreshold ?? DEFAULT_PROMOTION_THRESHOLD)));
  const maxCatalogItems = Math.max(20, Math.min(500, Number(input.maxCatalogItems ?? DEFAULT_MAX_CATALOG_ITEMS)));

  const considered = rows
    .filter((row) => row.outcome !== "success")
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.issueKey.localeCompare(b.issueKey));

  const grouped = new Map<string, LessonRuleCatalogItem>();
  for (const row of considered) {
    const normalized = normalizeLesson(row.summary);
    const key = `${row.runType}|${row.issueKey}|${normalized.pattern}|${normalizeSummary(normalized.trigger)}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        id: `rule-${Buffer.from(key).toString("base64url").slice(0, 16)}`,
        pattern: normalized.pattern,
        trigger: normalized.trigger,
        prevention: normalized.prevention,
        verification: normalized.verification,
        runType: row.runType,
        issueKey: row.issueKey,
        count: 1,
        firstSeenAt: row.ts,
        lastSeenAt: row.ts,
        status: "candidate",
        sourceSummaries: [compact(row.summary, 120)],
      });
      continue;
    }
    existing.count += 1;
    if (row.ts < existing.firstSeenAt) existing.firstSeenAt = row.ts;
    if (row.ts > existing.lastSeenAt) existing.lastSeenAt = row.ts;
    existing.sourceSummaries = Array.from(new Set([...existing.sourceSummaries, compact(row.summary, 120)])).slice(-3);
  }

  const merged = Array.from(grouped.values())
    .sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt) || a.id.localeCompare(b.id))
    .slice(0, maxCatalogItems)
    .map((item) => {
      const prev = previous?.items.find((p) => p.id === item.id);
      const activeNow = item.count >= promotionThreshold;
      const status: LessonRuleCatalogItem["status"] =
        activeNow ? "active" : prev?.status === "active" ? "deprecated" : "candidate";
      return { ...item, status };
    });

  const catalog: LessonRuleCatalog = {
    version: 1,
    generatedAt: deterministicTimestamp(considered),
    sourceFile: ".openclaw/lessons/workflow-lessons.jsonl",
    promotionThreshold,
    maxCatalogItems,
    items: merged,
  };

  await writeLessonRuleCatalog(input.projectPath, catalog);

  const promoted = merged.filter((item) => item.status === "active" && !previous?.items.some((p) => p.id === item.id && p.status === "active"));
  const deprecated = merged.filter((item) => item.status === "deprecated" && previous?.items.some((p) => p.id === item.id && p.status === "active"));

  return {
    ...catalog,
    promoted,
    deprecated,
    active: merged.filter((item) => item.status === "active"),
    candidate: merged.filter((item) => item.status === "candidate"),
  };
}

export async function loadLessonHint(
  projectPath: string,
  issueKey: string,
  options?: { source?: string; injectTelemetry?: boolean; budgetChars?: number; maxRules?: number },
): Promise<LessonHint> {
  const rows = (await readLessonEventRows(projectPath)).filter((row) => row.issueKey === issueKey);
  const snippets = rows.slice(-3).map((row) => compact(row.summary, 140));
  const reanalysisRequired = rows.filter((row) => row.outcome === "failure").length >= 2;

  const budgetChars = Math.max(120, Math.min(2000, Number(options?.budgetChars ?? DEFAULT_INJECTION_CHAR_BUDGET)));
  const maxRules = Math.max(1, Math.min(8, Number(options?.maxRules ?? DEFAULT_INJECTION_RULE_LIMIT)));
  const catalog = await readLessonRuleCatalog(projectPath);
  const activeRules = (catalog?.items || []).filter((item) => item.status === "active");
  const ranked = activeRules
    .map((item) => ({ item, score: scoreRule(item, issueKey) }))
    .sort((a, b) => b.score - a.score || b.item.lastSeenAt.localeCompare(a.item.lastSeenAt))
    .slice(0, maxRules * 2);

  const selected: string[] = [];
  const sources: string[] = [];
  let usedChars = 0;
  for (const entry of ranked) {
    const instruction = toInstruction(entry.item);
    const nextChars = usedChars + instruction.length + (selected.length > 0 ? 1 : 0);
    if (nextChars > budgetChars) continue;
    selected.push(instruction);
    sources.push(entry.item.id);
    usedChars = nextChars;
    if (selected.length >= maxRules) break;
  }

  const hint: LessonHint = {
    issueKey,
    count: rows.length,
    reanalysisRequired,
    snippets,
    ruleSnippets: selected,
    telemetry: {
      source: options?.source || "unknown",
      snippetsInjected: snippets.length,
      rulesInjected: selected.length,
      charsInjected: usedChars,
      ruleSources: sources,
      budgetChars,
      budgetExceeded: false,
    },
  };

  if (options?.injectTelemetry !== false) {
    await appendLessonInjectionTelemetryRow(projectPath, {
      ts: new Date().toISOString(),
      issueKey,
      source: hint.telemetry.source,
      snippetsInjected: hint.telemetry.snippetsInjected,
      rulesInjected: hint.telemetry.rulesInjected,
      charsInjected: hint.telemetry.charsInjected,
      budgetChars: hint.telemetry.budgetChars,
      ruleSources: hint.telemetry.ruleSources,
      reanalysisRequired,
    });
  }

  return hint;
}
