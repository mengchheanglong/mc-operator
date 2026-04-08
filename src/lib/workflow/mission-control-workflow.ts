import { createHash } from "crypto";

export type WorkflowStage = "objective" | "constraints" | "execution" | "verification" | "report";
export type CostRiskTier = "low" | "medium" | "high";

export interface ContextBlock {
  label: string;
  content: string;
}

export interface ExecutionPacket {
  workflow: WorkflowStage[];
  brief: string;
  shortBrief: string;
  deepMode: boolean;
  boundedContext: {
    maxBlocks: number;
    maxCharsPerBlock: number;
    maxTotalChars: number;
    usedChars: number;
    blocksUsed: number;
  };
  costRisk: {
    tier: CostRiskTier;
    score: number;
    label: string;
    reasons: string[];
  };
  runSignature: string;
}

const WORKFLOW: WorkflowStage[] = ["objective", "constraints", "execution", "verification", "report"];

function normalizeText(input: string) {
  return input.replace(/\r\n/g, "\n").trim();
}

function compactText(input: string, maxChars: number) {
  const normalized = normalizeText(input);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}\n...[truncated ${normalized.length - maxChars} chars]`;
}

export function dedupeContextBlocks(blocks: ContextBlock[]) {
  const seen = new Set<string>();
  const result: ContextBlock[] = [];

  for (const block of blocks) {
    const content = normalizeText(block.content);
    if (!content) continue;
    const key = `${block.label.toLowerCase()}::${content.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ label: block.label.trim() || "context", content });
  }

  return result;
}

export function buildExecutionPacket(input: {
  objective: string;
  constraints: string[];
  executionNotes: string[];
  verification: string[];
  reportFormat: string[];
  contextBlocks?: ContextBlock[];
  deepMode?: boolean;
}) : ExecutionPacket {
  const deepMode = Boolean(input.deepMode);
  const maxBlocks = deepMode ? 10 : 5;
  const maxCharsPerBlock = deepMode ? 1800 : 900;
  const maxTotalChars = deepMode ? 12000 : 5500;

  const compactObjective = compactText(input.objective, deepMode ? 900 : 360);
  const compactConstraints = input.constraints.map((item) => compactText(item, 260)).filter(Boolean);
  const compactExecution = input.executionNotes.map((item) => compactText(item, 260)).filter(Boolean);
  const compactVerification = input.verification.map((item) => compactText(item, 220)).filter(Boolean);
  const compactReport = input.reportFormat.map((item) => compactText(item, 240)).filter(Boolean);

  const deduped = dedupeContextBlocks(input.contextBlocks || []);
  const boundedBlocks: ContextBlock[] = [];
  let usedChars = 0;

  for (const block of deduped) {
    if (boundedBlocks.length >= maxBlocks) break;
    const compacted = compactText(block.content, maxCharsPerBlock);
    if (!compacted) continue;
    if (usedChars + compacted.length > maxTotalChars) break;
    boundedBlocks.push({ label: block.label, content: compacted });
    usedChars += compacted.length;
  }

  const sections = [
    "Workflow",
    ...WORKFLOW.map((stage) => `- ${stage}`),
    "",
    "Objective",
    compactObjective,
    "",
    "Constraints",
    ...(compactConstraints.length ? compactConstraints.map((item) => `- ${item}`) : ["- none"]),
    "",
    "Execution",
    ...(compactExecution.length ? compactExecution.map((item) => `- ${item}`) : ["- Execute task directly with minimal, verifiable edits."]),
    "",
    "Verification",
    ...(compactVerification.length ? compactVerification.map((item) => `- ${item}`) : ["- Run required checks before reporting completion."]),
    "",
    "Report",
    ...(compactReport.length ? compactReport.map((item) => `- ${item}`) : ["- Include changed files, checks, and remaining risks."]),
    "",
    "Context",
    ...(boundedBlocks.length
      ? boundedBlocks.flatMap((block) => [`## ${block.label}`, block.content, ""]).slice(0, -1)
      : ["- none"]),
  ].join("\n");

  const shortBrief = [
    `Objective: ${compactObjective}`,
    `Constraints: ${compactConstraints.slice(0, 3).join("; ") || "none"}`,
    `Verification: ${compactVerification.slice(0, 3).join("; ") || "required before completion"}`,
    `Report: ${compactReport.slice(0, 2).join("; ") || "changed files + checks + follow-up"}`,
  ].join("\n");

  const score =
    Math.min(100, Math.round(sections.length / 180) + (deepMode ? 25 : 0) + boundedBlocks.length * 4);
  const tier: CostRiskTier = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  const reasons = [
    deepMode ? "deep mode enabled" : "short brief mode",
    `${boundedBlocks.length} context block(s)`,
    `${sections.length} chars total brief length`,
  ];

  const runSignature = createHash("sha256")
    .update(`${compactObjective}|${compactConstraints.join("|")}|${shortBrief}`)
    .digest("hex");

  return {
    workflow: WORKFLOW,
    brief: sections,
    shortBrief,
    deepMode,
    boundedContext: {
      maxBlocks,
      maxCharsPerBlock,
      maxTotalChars,
      usedChars,
      blocksUsed: boundedBlocks.length,
    },
    costRisk: {
      tier,
      score,
      label: `cost-risk/${tier}`,
      reasons,
    },
    runSignature,
  };
}

export function isDuplicateRun(input: {
  cache: Set<string>;
  signature: string;
  salt: string;
}) {
  const windowKey = `${new Date().toISOString().slice(0, 16)}|${input.salt}|${input.signature}`;
  if (input.cache.has(windowKey)) {
    return true;
  }
  input.cache.add(windowKey);
  return false;
}

export function validateQuestStatusTransition(current: string, next: string) {
  const allowed: Record<string, Set<string>> = {
    open: new Set(["in_progress", "blocked", "done"]),
    in_progress: new Set(["blocked", "done", "open"]),
    blocked: new Set(["in_progress", "open"]),
    done: new Set(["in_progress"]),
  };
  return allowed[current]?.has(next) ?? false;
}
