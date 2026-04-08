import type {
  AutomationExecutionEnv,
  AutomationExecutor,
} from "@/server/repositories/automation-templates-repo";

export type TemplateCheckSeverity = "info" | "warning" | "error";

export interface TemplateCheckFinding {
  severity: TemplateCheckSeverity;
  title: string;
  detail: string;
}

export interface TemplateCheckResult {
  score: number;
  summary: string;
  recommendedStatus: "success" | "warning" | "error";
  findings: TemplateCheckFinding[];
}

function hasPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function buildSummary(score: number, findings: TemplateCheckFinding[]) {
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const errors = findings.filter((item) => item.severity === "error").length;

  if (errors > 0) {
    return `Prompt check found ${errors} error${errors === 1 ? "" : "s"} and ${warnings} warning${warnings === 1 ? "" : "s"}.`;
  }

  if (warnings > 0) {
    return `Prompt check passed with ${warnings} warning${warnings === 1 ? "" : "s"} (score ${score}).`;
  }

  return `Prompt check passed cleanly (score ${score}).`;
}

export function evaluateAutomationTemplate(input: {
  name: string;
  prompt: string;
  executor: AutomationExecutor;
  executionEnv: AutomationExecutionEnv;
  area: string | null;
  webhookPath: string | null;
  topics: string[];
}) : TemplateCheckResult {
  const findings: TemplateCheckFinding[] = [];
  let score = 100;
  const prompt = input.prompt.trim();
  const lowerPrompt = prompt.toLowerCase();

  if (prompt.length < 90) {
    findings.push({
      severity: "warning",
      title: "Prompt is probably too short",
      detail: "Very short prompts tend to underspecify scope, output, or verification and produce driftier agent behavior.",
    });
    score -= 15;
  }

  if (prompt.length > 1200) {
    findings.push({
      severity: "warning",
      title: "Prompt is too dense",
      detail: "Long prompts are harder to reuse and usually mix task, context, and policy. Prefer a tighter reusable instruction.",
    });
    score -= 10;
  }

  if (
    !hasPattern(lowerPrompt, [
      /\b(one|small|narrow|bounded|focused)\b/,
      /\b(component|route|file|screen|function|workflow|template|project)\b/,
    ])
  ) {
    findings.push({
      severity: "warning",
      title: "Scope is vague",
      detail: "The prompt does not clearly constrain where the work should happen. Add a narrow target like one file, one route, or one workflow.",
    });
    score -= 15;
  }

  if (
    !hasPattern(lowerPrompt, [
      /\b(verify|verification|test|lint|typecheck|build|check)\b/,
    ])
  ) {
    findings.push({
      severity: "warning",
      title: "No verification step",
      detail: "Reusable automation prompts should say how success is proven, for example lint, build, typecheck, or another explicit check.",
    });
    score -= 18;
  }

  if (
    !hasPattern(lowerPrompt, [
      /\b(output|return|summarize|summary|report|follow-up|changed files)\b/,
    ])
  ) {
    findings.push({
      severity: "warning",
      title: "Output is unclear",
      detail: "The prompt should say what the agent must return, such as changed files, verification result, or follow-up.",
    });
    score -= 12;
  }

  if (input.topics.length === 0) {
    findings.push({
      severity: "warning",
      title: "Topics are missing",
      detail: "Topics help graphing, filtering, and later retrieval. Add 1-3 stable topics for this template.",
    });
    score -= 8;
  }

  if (input.executor === "n8n" && !String(input.webhookPath || "").trim()) {
    findings.push({
      severity: "error",
      title: "n8n executor has no webhook path",
      detail: "Direct n8n queueing needs a webhook path. Without it the template can only be generated, not dispatched.",
    });
    score -= 30;
  }

  if (input.executor !== "n8n" && String(input.webhookPath || "").trim()) {
    findings.push({
      severity: "info",
      title: "Webhook path is unused",
      detail: "This template is not using the n8n executor, so the webhook path is only informational right now.",
    });
  }

  if (input.executor === "openclaw" && input.executionEnv !== "local") {
    findings.push({
      severity: "warning",
      title: "OpenClaw usually wants local execution",
      detail: "OpenClaw handoff templates usually work best with local execution context instead of worktree-specific dispatch.",
    });
    score -= 8;
  }

  if (
    !hasPattern(lowerPrompt, [
      /\b(keep|discard|revert|retry differently)\b/,
    ]) &&
    hasPattern(lowerPrompt, [/\b(loop|autonomous|iterate|improve)\b/])
  ) {
    findings.push({
      severity: "info",
      title: "Autonomous loop lacks keep-or-discard guardrail",
      detail: "If this template is meant to iterate autonomously, add an explicit keep-or-discard rule so it does not drift indefinitely.",
    });
  }

  score = Math.max(0, Math.min(100, score));

  const recommendedStatus =
    findings.some((item) => item.severity === "error")
      ? "error"
      : findings.some((item) => item.severity === "warning")
        ? "warning"
        : "success";

  return {
    score,
    summary: buildSummary(score, findings),
    recommendedStatus,
    findings,
  };
}
