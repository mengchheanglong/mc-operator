import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { SqliteService } from "../../infra/sqlite/sqlite.service";

const execFileAsync = promisify(execFile);
const DEFAULT_PROJECT_ID = "mc-operator";
const MAX_STORED_DISPATCH_BODY = 12_000;
const WORKFLOW = [
  "objective",
  "constraints",
  "execution",
  "verification",
  "report",
] as const;

type TemplateExecutor = "codex" | "openclaw" | "n8n";
type TemplateCheckSeverity = "info" | "warning" | "error";

interface TemplateCheckFinding {
  severity: TemplateCheckSeverity;
  title: string;
  detail: string;
}

interface TemplateCheckResult {
  score: number;
  summary: string;
  recommendedStatus: "success" | "warning" | "error";
  findings: TemplateCheckFinding[];
}

interface TemplateRow {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  prompt: string;
  executor: TemplateExecutor;
  executionEnv: string;
  webhookPath: string | null;
  status: string;
  area: string | null;
  topics: string[];
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateRunRow {
  id: string;
  userId: string;
  projectId: string;
  templateId: string;
  mode: "prepare" | "execute" | "evaluate";
  status: "queued" | "dispatched" | "success" | "warning" | "error";
  summary: string | null;
  idempotencyKey: string | null;
  targetUrl: string | null;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface DispatchResult {
  ok: boolean;
  status: number;
  body: string;
  command?: string | null;
  args?: string[] | null;
  parsed?: Record<string, unknown> | null;
  agentId?: string | null;
  failureClass?: string | null;
  attempts?: number;
  totalDurationMs?: number;
  modelUsed?: string | null;
  fallbackUsed?: boolean;
}

interface ExecuteResult {
  statusCode: number;
  payload: Record<string, unknown>;
}

export class AutomationTemplateExecuteError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(input: {
    message: string;
    status: number;
    code: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
    this.details = input.details || {};
  }
}

@Injectable()
export class AutomationTemplateExecuteService {
  constructor(private readonly sqlite: SqliteService) {}

  private s(value: unknown) {
    return String(value ?? "").trim();
  }

  private parseJsonObject(value: unknown): Record<string, unknown> {
    if (typeof value !== "string" || !value.trim()) return {};
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
    return {};
  }

  private parseJsonArray(value: unknown): string[] {
    if (typeof value !== "string" || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => this.s(entry))
          .filter(Boolean);
      }
    } catch {}
    return [];
  }

  private stringifyJsonObject(value: Record<string, unknown>) {
    return JSON.stringify(value || {});
  }

  private resolveProjectId(projectId?: unknown) {
    return this.s(projectId) || DEFAULT_PROJECT_ID;
  }

  private resolveExecutor(value: unknown): TemplateExecutor {
    const normalized = this.s(value).toLowerCase();
    if (normalized === "openclaw" || normalized === "n8n") return normalized;
    return "codex";
  }

  private resolveExecutionEnv(value: unknown) {
    return this.s(value).toLowerCase() === "local" ? "local" : "worktree";
  }

  private resolveTemplateStatus(value: unknown) {
    return this.s(value).toLowerCase() === "paused" ? "paused" : "active";
  }

  private normalizeArea(value: unknown) {
    const trimmed = this.s(value).toLowerCase().replace(/\s+/g, " ").trim();
    return trimmed || null;
  }

  private normalizeWebhookPath(value: unknown) {
    const trimmed = this.s(value);
    return trimmed || null;
  }

  private normalizeTopicValue(value: unknown) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[._/]+/g, " ")
      .trim();
  }

  private normalizeTopics(values: unknown) {
    const source = Array.isArray(values)
      ? values
      : typeof values === "string"
        ? values.split(",")
        : [];
    const normalized = source
      .map((value) => this.normalizeTopicValue(value))
      .filter(Boolean);
    return Array.from(new Set(normalized));
  }

  private operator() {
    const latest = this.sqlite.connection
      .prepare(
        "SELECT id FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1",
      )
      .get() as Record<string, unknown> | undefined;
    if (latest) {
      return { id: this.s(latest.id) };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    this.sqlite.connection
      .prepare(
        "INSERT INTO users (id, name, timezone, join_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, "Operator", "Asia/Bangkok", now, now, now);
    return { id };
  }

  private toTemplateRow(raw: Record<string, unknown>): TemplateRow {
    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      name: this.s(raw.name),
      prompt: this.s(raw.prompt),
      executor: this.resolveExecutor(raw.executor),
      executionEnv: this.s(raw.execution_env) || "worktree",
      webhookPath: this.s(raw.webhook_path) || null,
      status: this.s(raw.status) || "active",
      area: this.s(raw.area) || null,
      topics: this.parseJsonArray(raw.topics_json),
      lastRunAt: this.s(raw.last_run_at) || null,
      lastRunStatus: this.s(raw.last_run_status) || null,
      lastRunSummary: this.s(raw.last_run_summary) || null,
      createdAt: this.s(raw.created_at),
      updatedAt: this.s(raw.updated_at),
    };
  }

  private findTemplateById(userId: string, projectId: string, templateId: string) {
    const row = this.sqlite.connection
      .prepare(
        "SELECT * FROM automation_templates WHERE user_id = ? AND project_id = ? AND id = ? LIMIT 1",
      )
      .get(userId, projectId, templateId) as Record<string, unknown> | undefined;
    return row ? this.toTemplateRow(row) : null;
  }

  private listTemplates(userId: string, projectId: string) {
    const rows = this.sqlite.connection
      .prepare(
        "SELECT * FROM automation_templates WHERE user_id = ? AND project_id = ? ORDER BY updated_at DESC",
      )
      .all(userId, projectId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.toTemplateRow(row));
  }

  private toTemplateRunRow(raw: Record<string, unknown>): TemplateRunRow {
    return {
      id: this.s(raw.id),
      userId: this.s(raw.user_id),
      projectId: this.s(raw.project_id),
      templateId: this.s(raw.template_id),
      mode:
        (this.s(raw.mode) as "prepare" | "execute" | "evaluate") || "execute",
      status:
        (this.s(raw.status) as
          | "queued"
          | "dispatched"
          | "success"
          | "warning"
          | "error") || "queued",
      summary: this.s(raw.summary) || null,
      idempotencyKey: this.s(raw.idempotency_key) || null,
      targetUrl: this.s(raw.target_url) || null,
      request: this.parseJsonObject(raw.request_json),
      response: this.parseJsonObject(raw.response_json),
      errorMessage: this.s(raw.error_message) || null,
      createdAt: this.s(raw.created_at),
      updatedAt: this.s(raw.updated_at),
      completedAt: this.s(raw.completed_at) || null,
    };
  }

  private listTemplateRuns(userId: string, projectId: string, templateId: string, limit = 20) {
    const rows = this.sqlite.connection
      .prepare(
        "SELECT * FROM automation_template_runs WHERE user_id = ? AND project_id = ? AND template_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(userId, projectId, templateId, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.toTemplateRunRow(row));
  }

  private createTemplate(input: {
    userId: string;
    projectId: string;
    body: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    const executor = this.resolveExecutor(input.body.executor);
    const webhookPath =
      this.normalizeWebhookPath(input.body.webhookPath) ||
      (executor === "n8n" ? "/webhook/mc-operator/openclaw-router" : null);
    const row = {
      id: randomUUID(),
      user_id: input.userId,
      project_id: input.projectId,
      name: this.s(input.body.name).slice(0, 80),
      prompt: this.s(input.body.prompt).slice(0, 4000),
      executor,
      execution_env: this.resolveExecutionEnv(input.body.executionEnv),
      webhook_path: webhookPath,
      status: this.resolveTemplateStatus(input.body.status),
      area: this.normalizeArea(input.body.area),
      topics_json: JSON.stringify(this.normalizeTopics(input.body.topics)),
      last_run_at: null,
      last_run_status: null,
      last_run_summary: null,
      created_at: now,
      updated_at: now,
    };
    this.sqlite.connection
      .prepare(
        "INSERT INTO automation_templates (id, user_id, project_id, name, prompt, executor, execution_env, webhook_path, status, area, topics_json, last_run_at, last_run_status, last_run_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.user_id,
        row.project_id,
        row.name,
        row.prompt,
        row.executor,
        row.execution_env,
        row.webhook_path,
        row.status,
        row.area,
        row.topics_json,
        row.last_run_at,
        row.last_run_status,
        row.last_run_summary,
        row.created_at,
        row.updated_at,
      );
    return this.toTemplateRow(row);
  }

  private updateTemplate(input: {
    userId: string;
    projectId: string;
    templateId: string;
    body: Record<string, unknown>;
  }) {
    const existing = this.findTemplateById(
      input.userId,
      input.projectId,
      input.templateId,
    );
    if (!existing) return null;

    const now = new Date().toISOString();
    const assignments: string[] = ["updated_at = ?"];
    const params: Array<unknown> = [now];

    if (input.body.name !== undefined) {
      assignments.push("name = ?");
      params.push(this.s(input.body.name).slice(0, 80));
    }
    if (input.body.prompt !== undefined) {
      assignments.push("prompt = ?");
      params.push(this.s(input.body.prompt).slice(0, 4000));
    }
    if (input.body.executor !== undefined) {
      assignments.push("executor = ?");
      params.push(this.resolveExecutor(input.body.executor));
    }
    if (input.body.executionEnv !== undefined) {
      assignments.push("execution_env = ?");
      params.push(this.resolveExecutionEnv(input.body.executionEnv));
    }
    if (input.body.status !== undefined) {
      assignments.push("status = ?");
      params.push(this.resolveTemplateStatus(input.body.status));
    }
    if (input.body.area !== undefined) {
      assignments.push("area = ?");
      params.push(this.normalizeArea(input.body.area));
    }
    if (input.body.webhookPath !== undefined) {
      assignments.push("webhook_path = ?");
      params.push(this.normalizeWebhookPath(input.body.webhookPath));
    }
    if (input.body.topics !== undefined) {
      assignments.push("topics_json = ?");
      params.push(JSON.stringify(this.normalizeTopics(input.body.topics)));
    }

    if (
      input.body.webhookPath === undefined &&
      this.resolveExecutor(input.body.executor ?? existing.executor) === "n8n" &&
      !existing.webhookPath
    ) {
      assignments.push("webhook_path = ?");
      params.push("/webhook/mc-operator/openclaw-router");
    }

    params.push(input.userId, input.projectId, input.templateId);
    this.sqlite.connection
      .prepare(
        `UPDATE automation_templates SET ${assignments.join(", ")} WHERE user_id = ? AND project_id = ? AND id = ?`,
      )
      .run(...params);

    return this.findTemplateById(input.userId, input.projectId, input.templateId);
  }

  private deleteTemplate(userId: string, projectId: string, templateId: string) {
    const result = this.sqlite.connection
      .prepare(
        "DELETE FROM automation_templates WHERE user_id = ? AND project_id = ? AND id = ?",
      )
      .run(userId, projectId, templateId);
    return (result.changes || 0) > 0;
  }

  private createTemplateRun(input: {
    userId: string;
    projectId: string;
    templateId: string;
    mode: "execute" | "evaluate";
    status: string;
    summary?: string;
    idempotencyKey?: string | null;
    targetUrl?: string | null;
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    errorMessage?: string | null;
  }) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      user_id: input.userId,
      project_id: input.projectId,
      template_id: input.templateId,
      mode: input.mode,
      status: input.status,
      summary: this.s(input.summary).slice(0, 240) || null,
      idempotency_key: this.s(input.idempotencyKey) || null,
      target_url: this.s(input.targetUrl) || null,
      request_json: this.stringifyJsonObject(input.request || {}),
      response_json: this.stringifyJsonObject(input.response || {}),
      error_message: this.s(input.errorMessage) || null,
      created_at: now,
      updated_at: now,
      completed_at:
        input.mode === "evaluate" ? now : null,
    };
    this.sqlite.connection
      .prepare(
        "INSERT INTO automation_template_runs (id, user_id, project_id, template_id, mode, status, summary, idempotency_key, target_url, request_json, response_json, error_message, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.user_id,
        row.project_id,
        row.template_id,
        row.mode,
        row.status,
        row.summary,
        row.idempotency_key,
        row.target_url,
        row.request_json,
        row.response_json,
        row.error_message,
        row.created_at,
        row.updated_at,
        row.completed_at,
      );
    return { id: row.id };
  }

  private hasPattern(text: string, patterns: RegExp[]) {
    return patterns.some((pattern) => pattern.test(text));
  }

  private buildCheckSummary(score: number, findings: TemplateCheckFinding[]) {
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

  private evaluateTemplate(input: TemplateRow): TemplateCheckResult {
    const findings: TemplateCheckFinding[] = [];
    let score = 100;
    const prompt = input.prompt.trim();
    const lowerPrompt = prompt.toLowerCase();

    if (prompt.length < 90) {
      findings.push({
        severity: "warning",
        title: "Prompt is probably too short",
        detail:
          "Very short prompts tend to underspecify scope, output, or verification and produce driftier agent behavior.",
      });
      score -= 15;
    }

    if (prompt.length > 1200) {
      findings.push({
        severity: "warning",
        title: "Prompt is too dense",
        detail:
          "Long prompts are harder to reuse and usually mix task, context, and policy. Prefer a tighter reusable instruction.",
      });
      score -= 10;
    }

    if (
      !this.hasPattern(lowerPrompt, [
        /\b(one|small|narrow|bounded|focused)\b/,
        /\b(component|route|file|screen|function|workflow|template|project)\b/,
      ])
    ) {
      findings.push({
        severity: "warning",
        title: "Scope is vague",
        detail:
          "The prompt does not clearly constrain where the work should happen. Add a narrow target like one file, one route, or one workflow.",
      });
      score -= 15;
    }

    if (!this.hasPattern(lowerPrompt, [/\b(verify|verification|test|lint|typecheck|build|check)\b/])) {
      findings.push({
        severity: "warning",
        title: "No verification step",
        detail:
          "Reusable automation prompts should say how success is proven, for example lint, build, typecheck, or another explicit check.",
      });
      score -= 18;
    }

    if (!this.hasPattern(lowerPrompt, [/\b(output|return|summarize|summary|report|follow-up|changed files)\b/])) {
      findings.push({
        severity: "warning",
        title: "Output is unclear",
        detail:
          "The prompt should say what the agent must return, such as changed files, verification result, or follow-up.",
      });
      score -= 12;
    }

    if (input.topics.length === 0) {
      findings.push({
        severity: "warning",
        title: "Topics are missing",
        detail:
          "Topics help graphing, filtering, and later retrieval. Add 1-3 stable topics for this template.",
      });
      score -= 8;
    }

    if (input.executor === "n8n" && !this.s(input.webhookPath)) {
      findings.push({
        severity: "error",
        title: "n8n executor has no webhook path",
        detail:
          "Direct n8n queueing needs a webhook path. Without it the template can only be generated, not dispatched.",
      });
      score -= 30;
    }

    if (input.executor !== "n8n" && this.s(input.webhookPath)) {
      findings.push({
        severity: "info",
        title: "Webhook path is unused",
        detail:
          "This template is not using the n8n executor, so the webhook path is only informational right now.",
      });
    }

    if (input.executor === "openclaw" && input.executionEnv !== "local") {
      findings.push({
        severity: "warning",
        title: "OpenClaw usually wants local execution",
        detail:
          "OpenClaw handoff templates usually work best with local execution context instead of worktree-specific dispatch.",
      });
      score -= 8;
    }

    if (
      !this.hasPattern(lowerPrompt, [/\b(keep|discard|revert|retry differently)\b/]) &&
      this.hasPattern(lowerPrompt, [/\b(loop|autonomous|iterate|improve)\b/])
    ) {
      findings.push({
        severity: "info",
        title: "Autonomous loop lacks keep-or-discard guardrail",
        detail:
          "If this template is meant to iterate autonomously, add an explicit keep-or-discard rule so it does not drift indefinitely.",
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
      summary: this.buildCheckSummary(score, findings),
      recommendedStatus,
      findings,
    };
  }

  private updateTemplateRun(input: {
    userId: string;
    projectId: string;
    runId: string;
    status: "dispatched" | "error";
    summary: string;
    response: Record<string, unknown>;
    errorMessage?: string | null;
  }) {
    const now = new Date().toISOString();
    this.sqlite.connection
      .prepare(
        "UPDATE automation_template_runs SET status = ?, summary = ?, response_json = ?, error_message = ?, updated_at = ?, completed_at = ? WHERE user_id = ? AND project_id = ? AND id = ?",
      )
      .run(
        input.status,
        input.summary.slice(0, 240),
        this.stringifyJsonObject(input.response),
        this.s(input.errorMessage) || null,
        now,
        now,
        input.userId,
        input.projectId,
        input.runId,
      );
  }

  private recordTemplateRun(
    userId: string,
    projectId: string,
    templateId: string,
    status: string,
    summary: string,
  ) {
    const now = new Date().toISOString();
    this.sqlite.connection
      .prepare(
        "UPDATE automation_templates SET last_run_at = ?, last_run_status = ?, last_run_summary = ?, updated_at = ? WHERE user_id = ? AND project_id = ? AND id = ?",
      )
      .run(
        now,
        status,
        summary.slice(0, 240),
        now,
        userId,
        projectId,
        templateId,
      );
    return this.findTemplateById(userId, projectId, templateId);
  }

  private createReport(input: {
    userId: string;
    projectId: string;
    title: string;
    content: string;
    status: "info" | "error";
    area: string;
    topics: string[];
    metadata: Record<string, unknown>;
  }) {
    const row = {
      id: randomUUID(),
      user_id: input.userId,
      project_id: input.projectId,
      title: input.title,
      content: input.content,
      category: input.status === "error" ? "maintenance" : "task",
      status: input.status,
      area: input.area,
      linked_quest_id: null,
      source: "Mission Control",
      metadata_json: this.stringifyJsonObject(input.metadata),
      date: new Date().toISOString(),
    };
    this.sqlite.connection
      .prepare(
        "INSERT INTO reports (id, user_id, project_id, title, content, category, status, area, linked_quest_id, source, metadata_json, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.user_id,
        row.project_id,
        row.title,
        row.content,
        row.category,
        row.status,
        row.area,
        row.linked_quest_id,
        row.source,
        row.metadata_json,
        row.date,
      );
    return { id: row.id, date: row.date };
  }

  private buildReportHref(date: string) {
    const day = date.slice(0, 10);
    return day ? `/dashboard/report?day=${encodeURIComponent(day)}` : "/dashboard/report";
  }

  private normalizeUrl(value?: string | null) {
    const normalized = this.s(value);
    if (!normalized) return null;
    return normalized.replace(/\/+$/, "");
  }

  private joinUrl(baseUrl: string, pathname: string) {
    return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  }

  private buildIdempotencyKey(input: {
    projectId: string;
    templateId: string;
    prompt: string;
    topics: string[];
  }) {
    const minuteBucket = new Date().toISOString().slice(0, 16);
    return createHash("sha256")
      .update(
        [
          input.projectId,
          input.templateId,
          input.prompt.trim(),
          input.topics.join(","),
          minuteBucket,
        ].join("|"),
      )
      .digest("hex");
  }

  private buildBrief(input: {
    projectId: string;
    templateName: string;
    prompt: string;
    executor: string;
    executionEnv: string;
    topics: string[];
    deepMode: boolean;
  }) {
    return [
      "Workflow",
      ...WORKFLOW.map((stage) => `- ${stage}`),
      "",
      "Objective",
      input.prompt.trim(),
      "",
      "Context",
      `Project: ${input.projectId}`,
      `Template: ${input.templateName}`,
      `Executor: ${input.executor}`,
      `Environment: ${input.executionEnv}`,
      `Topics: ${input.topics.join(", ") || "none"}`,
      `Deep mode: ${String(input.deepMode)}`,
      "",
      "Constraints",
      "- Keep scope bounded to this single automation execute request.",
      "- Return concise verification evidence in final output.",
    ].join("\n");
  }

  private buildPreparationBrief(input: {
    projectId: string;
    template: TemplateRow;
  }) {
    const lines = [
      `Automation Template: ${input.template.name}`,
      `Project: ${input.projectId} (${input.projectId})`,
      `Executor: ${input.template.executor}`,
      `Environment: ${input.template.executionEnv}`,
    ];

    if (input.template.area) {
      lines.push(`Area: ${input.template.area}`);
    }

    if (input.template.topics.length > 0) {
      lines.push(`Topics: ${input.template.topics.join(", ")}`);
    }

    lines.push("");
    lines.push("Task");
    lines.push(input.template.prompt.trim());
    lines.push("");
    lines.push("Expected output");
    lines.push("- make the change or prepare the execution payload");
    lines.push("- log the outcome in Mission Control Reports");
    lines.push("- create or update a Quest if follow-up work is needed");

    return lines.join("\n");
  }

  private buildCostRisk(brief: string, deepMode: boolean) {
    const score = Math.min(100, Math.round(brief.length / 180) + (deepMode ? 25 : 0));
    const tier = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
    return {
      tier,
      score,
      label: `cost-risk/${tier}`,
      reasons: [
        deepMode ? "deep mode enabled" : "short brief mode",
        `${brief.length} chars total brief length`,
      ],
    };
  }

  private buildExecutorPayload(input: {
    projectId: string;
    template: TemplateRow;
    idempotencyKey: string;
    workflow: string[];
    costRisk: Record<string, unknown>;
  }) {
    return {
      projectId: input.projectId,
      templateId: input.template.id,
      templateName: input.template.name,
      executor: input.template.executor,
      executionEnv: input.template.executionEnv,
      area: input.template.area,
      topics: input.template.topics,
      webhookPath: input.template.webhookPath,
      prompt: input.template.prompt.trim(),
      generatedTaskBrief: input.template.prompt.trim(),
      idempotencyKey: input.idempotencyKey,
      workflow: input.workflow,
      costRisk: input.costRisk,
      dispatchedAt: new Date().toISOString(),
    };
  }

  private buildPreparationExecutorPayload(input: {
    projectId: string;
    template: TemplateRow;
  }) {
    return {
      projectId: input.projectId,
      projectName: input.projectId,
      projectPath: input.projectId,
      templateId: input.template.id,
      templateName: input.template.name,
      executor: input.template.executor,
      executionEnv: input.template.executionEnv,
      area: input.template.area,
      topics: input.template.topics,
      prompt: input.template.prompt.trim(),
    };
  }

  private truncateDispatchBody(body: string) {
    const trimmed = this.s(body);
    if (trimmed.length <= MAX_STORED_DISPATCH_BODY) return trimmed;
    return `${trimmed.slice(0, MAX_STORED_DISPATCH_BODY)}\n\n...[truncated ${trimmed.length - MAX_STORED_DISPATCH_BODY} chars]`;
  }

  private tryParseJson(input: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
    return null;
  }

  private extractOpenClawSummary(parsed: Record<string, unknown> | null, fallback: string) {
    if (!parsed) return fallback;
    const result = parsed.result;
    if (!result || typeof result !== "object") return fallback;
    const payloads = (result as { payloads?: unknown }).payloads;
    if (!Array.isArray(payloads) || payloads.length === 0) return fallback;
    const text = (payloads[0] as { text?: unknown })?.text;
    return typeof text === "string" && text.trim() ? text.trim() : fallback;
  }

  private normalizeStdout(stdout: string, stderr: string) {
    const lines = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    let parsed: Record<string, unknown> | null = null;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const candidate = lines[index];
      if (!(candidate?.startsWith("{") && candidate.endsWith("}"))) continue;
      try {
        parsed = JSON.parse(candidate) as Record<string, unknown>;
        break;
      } catch {}
    }
    return {
      body: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n").trim(),
      parsed,
    };
  }

  private classifyFailure(status: number, body: string) {
    const lower = body.toLowerCase();
    if (status === 408 || lower.includes("timeout") || lower.includes("aborted")) {
      return "timeout";
    }
    if (status === 429 || lower.includes("rate limit")) {
      return "rate_limit";
    }
    if (status >= 500 || lower.includes("provider")) {
      return "provider_error";
    }
    if (status === 400 || lower.includes("invalid") || lower.includes("validation")) {
      return "validation_error";
    }
    return "tool_error";
  }

  private async validateOpenClawPreflight() {
    const repairScript = path.join(
      os.homedir(),
      ".openclaw",
      "workspace",
      "scripts",
      "repair-openclaw-command.ps1",
    );
    let hasRepair = false;
    try {
      await access(repairScript);
      hasRepair = true;
    } catch {}

    if (!hasRepair) {
      try {
        await execFileAsync("where.exe", ["openclaw"], {
          windowsHide: true,
          timeout: 10_000,
        });
      } catch {
        return {
          ok: false,
          issues: [
            {
              missingPath: "openclaw (CLI executable)",
              whyRequired:
                "Template execute with openclaw executor needs OpenClaw CLI access.",
              suggestedFix:
                "Install/repair OpenClaw CLI in PATH or restore ~/.openclaw/workspace/scripts/repair-openclaw-command.ps1.",
            },
          ],
        };
      }
    }

    return { ok: true, issues: [] as Array<Record<string, string>> };
  }

  private async resolvePowerShellArgs(input: {
    brief: string;
    timeoutSeconds: number;
    thinking: "low" | "medium" | "high";
  }) {
    const repairScript = path.join(
      os.homedir(),
      ".openclaw",
      "workspace",
      "scripts",
      "repair-openclaw-command.ps1",
    );
    try {
      await access(repairScript);
      return [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        repairScript,
        "agent",
        "--agent",
        "main",
        "--message",
        input.brief,
        "--thinking",
        input.thinking,
        "--timeout",
        String(input.timeoutSeconds),
        "--json",
      ];
    } catch {
      return [
        "-Command",
        `openclaw agent --agent "main" --message "${input.brief.replace(/\"/g, '\\"')}" --thinking ${input.thinking} --timeout ${String(input.timeoutSeconds)} --json`,
      ];
    }
  }

  private async dispatchToOpenClaw(input: {
    brief: string;
    timeoutSeconds: number;
    thinking: "low" | "medium" | "high";
  }): Promise<DispatchResult> {
    const args = await this.resolvePowerShellArgs(input);
    const startedAt = Date.now();
    try {
      const { stdout = "", stderr = "" } = await execFileAsync(
        "powershell.exe",
        args,
        {
          windowsHide: true,
          timeout: input.timeoutSeconds * 1000,
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      const normalized = this.normalizeStdout(String(stdout || ""), String(stderr || ""));
      return {
        ok: true,
        status: 200,
        body: normalized.body,
        command: "powershell.exe",
        args,
        parsed: normalized.parsed,
        agentId: "main",
        failureClass: null,
        attempts: 1,
        totalDurationMs: Date.now() - startedAt,
        modelUsed:
          this.s(process.env.OPENCLAW_MODEL) ||
          this.s(process.env.OPENCLAW_MODEL_PRIMARY) ||
          "default",
        fallbackUsed: false,
      };
    } catch (error) {
      const execError = error as Error & {
        code?: number | string;
        stdout?: string | Buffer;
        stderr?: string | Buffer;
      };
      const stdout = Buffer.isBuffer(execError.stdout)
        ? execError.stdout.toString()
        : String(execError.stdout || "");
      const stderr = Buffer.isBuffer(execError.stderr)
        ? execError.stderr.toString()
        : String(execError.stderr || "");
      const normalized = this.normalizeStdout(stdout, stderr);
      const status =
        typeof execError.code === "number" && Number.isFinite(execError.code)
          ? execError.code
          : 502;
      const body = normalized.body || execError.message || "OpenClaw dispatch failed.";
      return {
        ok: false,
        status,
        body,
        command: "powershell.exe",
        args,
        parsed: normalized.parsed,
        agentId: "main",
        failureClass: this.classifyFailure(status, body),
        attempts: 1,
        totalDurationMs: Date.now() - startedAt,
        modelUsed:
          this.s(process.env.OPENCLAW_MODEL) ||
          this.s(process.env.OPENCLAW_MODEL_PRIMARY) ||
          "default",
        fallbackUsed: false,
      };
    }
  }

  private async dispatchToN8n(input: {
    targetUrl: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    timeoutMs: number;
  }): Promise<DispatchResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetch(input.targetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": input.idempotencyKey,
        },
        body: JSON.stringify(input.payload),
        signal: controller.signal,
      });
      const body = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        body,
        command: input.targetUrl,
        args: [],
        parsed: this.tryParseJson(body),
        failureClass: response.ok ? null : this.classifyFailure(response.status, body),
        attempts: 1,
        totalDurationMs: Date.now() - startedAt,
        modelUsed: null,
        fallbackUsed: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const aborted =
        error instanceof DOMException && error.name.toLowerCase() === "aborterror";
      const status = aborted ? 408 : 502;
      return {
        ok: false,
        status,
        body: message || "n8n dispatch failed.",
        command: input.targetUrl,
        args: [],
        parsed: null,
        failureClass: this.classifyFailure(status, message || ""),
        attempts: 1,
        totalDurationMs: Date.now() - startedAt,
        modelUsed: null,
        fallbackUsed: false,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async executeTemplate(input: {
    projectId?: unknown;
    templateId: string;
    deepMode?: unknown;
  }): Promise<ExecuteResult> {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const templateId = this.s(input.templateId);
    const deepMode = Boolean(input.deepMode);

    if (!templateId) {
      throw new AutomationTemplateExecuteError({
        message: "Template ID is required.",
        status: 400,
        code: "missing_template_id",
      });
    }

    const template = this.findTemplateById(user.id, projectId, templateId);
    if (!template) {
      throw new AutomationTemplateExecuteError({
        message: "Automation template not found.",
        status: 404,
        code: "template_not_found",
      });
    }

    const n8nBaseUrl = this.normalizeUrl(process.env.N8N_BASE_URL);
    const webhookPath = this.s(template.webhookPath);
    if (template.executor === "n8n" && !webhookPath) {
      throw new AutomationTemplateExecuteError({
        message: "Template webhook path is required for n8n execute.",
        status: 400,
        code: "missing_webhook_path",
      });
    }
    if (template.executor === "n8n" && !n8nBaseUrl) {
      throw new AutomationTemplateExecuteError({
        message: "N8N_BASE_URL is not configured.",
        status: 400,
        code: "missing_n8n_base_url",
      });
    }

    if (template.executor === "openclaw") {
      const preflight = await this.validateOpenClawPreflight();
      if (!preflight.ok) {
        throw new AutomationTemplateExecuteError({
          message: "Execution blocked by runtime preflight.",
          status: 503,
          code: "missing_path",
          details: { issues: preflight.issues },
        });
      }
    }

    const idempotencyKey = this.buildIdempotencyKey({
      projectId,
      templateId: template.id,
      prompt: template.prompt,
      topics: template.topics,
    });
    const brief = this.buildBrief({
      projectId,
      templateName: template.name,
      prompt: template.prompt,
      executor: template.executor,
      executionEnv: template.executionEnv,
      topics: template.topics,
      deepMode,
    });
    const costRisk = this.buildCostRisk(brief, deepMode);
    const executorPayload = this.buildExecutorPayload({
      projectId,
      template,
      idempotencyKey,
      workflow: [...WORKFLOW],
      costRisk,
    });
    const targetUrl =
      template.executor === "n8n"
        ? this.joinUrl(String(n8nBaseUrl), webhookPath)
        : "openclaw agent";

    const run = this.createTemplateRun({
      userId: user.id,
      projectId,
      templateId: template.id,
      mode: "execute",
      status: "queued",
      summary: "Execution dispatch queued.",
      idempotencyKey,
      targetUrl,
      request: executorPayload,
    });

    let dispatch: DispatchResult;
    if (template.executor === "n8n") {
      dispatch = await this.dispatchToN8n({
        targetUrl,
        payload: executorPayload,
        idempotencyKey,
        timeoutMs: 12_000,
      });
    } else if (template.executor === "openclaw") {
      dispatch = await this.dispatchToOpenClaw({
        brief: `${brief}\n\nCost risk: ${costRisk.label}`,
        timeoutSeconds: 180,
        thinking: "medium",
      });
    } else {
      dispatch = {
        ok: false,
        status: 400,
        body: `Executor '${template.executor}' is not enabled for direct execute yet. Use openclaw or n8n executor, or Generate Task.`,
        command: null,
        args: [],
        parsed: null,
        failureClass: "validation_error",
        attempts: 1,
        totalDurationMs: 0,
        modelUsed: null,
        fallbackUsed: false,
      };
    }

    const dispatchBody = this.truncateDispatchBody(dispatch.body || "");
    const dispatchResponse = {
      status: dispatch.status,
      body: dispatchBody,
      command: dispatch.command || null,
      args: dispatch.args || null,
      parsed: dispatch.parsed || null,
      failureClass: dispatch.failureClass || null,
      attempts: dispatch.attempts || 1,
      totalDurationMs: dispatch.totalDurationMs || 0,
      modelUsed: dispatch.modelUsed || null,
      fallbackUsed: Boolean(dispatch.fallbackUsed),
    };

    if (!dispatch.ok) {
      const summary = `Dispatch failed (${dispatch.status})`;
      this.updateTemplateRun({
        userId: user.id,
        projectId,
        runId: run.id,
        status: "error",
        summary,
        response: dispatchResponse,
        errorMessage: dispatchBody || summary,
      });

      const updatedTemplate = this.recordTemplateRun(
        user.id,
        projectId,
        template.id,
        "error",
        summary,
      );

      const report = this.createReport({
        userId: user.id,
        projectId,
        title: `Automation dispatch failed: ${template.name}`,
        content:
          template.executor === "openclaw"
            ? `Command: ${dispatch.command || targetUrl}\nStatus: ${dispatch.status}\nIdempotency: ${idempotencyKey}\n\nResponse:\n${dispatchBody || "(empty)"}`
            : `Target: ${targetUrl}\nStatus: ${dispatch.status}\nIdempotency: ${idempotencyKey}\n\nResponse:\n${dispatchBody || "(empty)"}`,
        status: "error",
        area: template.area || "automation",
        topics: [...template.topics, "automation", "dispatch"],
        metadata: {
          templateId: template.id,
          idempotencyKey,
          dispatchStatus: dispatch.status,
          failureClass: dispatch.failureClass || null,
          totalDurationMs: dispatch.totalDurationMs || 0,
          modelUsed: dispatch.modelUsed || null,
          fallbackUsed: Boolean(dispatch.fallbackUsed),
        },
      });

      return {
        statusCode: 502,
        payload: {
          msg: "Automation dispatch failed.",
          template: updatedTemplate,
          run: {
            summary: `Dispatch failed with status ${dispatch.status}.`,
            brief,
            executorPayload,
            reportHref: this.buildReportHref(report.date),
            reportId: report.id,
            workflow: WORKFLOW,
            costRisk,
            promotionStatus: "ready",
            evalGuardWarning: null,
            failureClass: dispatch.failureClass || null,
            attempts: dispatch.attempts || 1,
            totalDurationMs: dispatch.totalDurationMs || 0,
            modelUsed: dispatch.modelUsed || null,
            fallbackUsed: Boolean(dispatch.fallbackUsed),
          },
        },
      };
    }

    const openClawSummary =
      template.executor === "openclaw"
        ? this.extractOpenClawSummary(dispatch.parsed || null, "Task sent to OpenClaw.")
        : null;
    const dispatchSummary =
      template.executor === "openclaw"
        ? openClawSummary || "Task sent to OpenClaw."
        : "Execution dispatched to n8n.";

    this.updateTemplateRun({
      userId: user.id,
      projectId,
      runId: run.id,
      status: "dispatched",
      summary: dispatchSummary,
      response: dispatchResponse,
      errorMessage: null,
    });

    const updatedTemplate = this.recordTemplateRun(
      user.id,
      projectId,
      template.id,
      "dispatched",
      dispatchSummary,
    );
    const report = this.createReport({
      userId: user.id,
      projectId,
      title:
        template.executor === "openclaw"
          ? `Automation sent to OpenClaw: ${template.name}`
          : `Automation dispatched: ${template.name}`,
      content:
        template.executor === "openclaw"
          ? `Command: ${dispatch.command || targetUrl}\nAgent: ${dispatch.agentId || "main"}\nIdempotency: ${idempotencyKey}\nStatus: ${dispatch.status}\nSummary: ${openClawSummary || "(none)"}\n\nResponse:\n${dispatchBody || "(empty)"}`
          : `Webhook: ${targetUrl}\nIdempotency: ${idempotencyKey}\nStatus: ${dispatch.status}\n\nResponse:\n${dispatchBody || "(empty)"}`,
      status: "info",
      area: template.area || "automation",
      topics: [
        ...template.topics,
        "automation",
        "dispatch",
        ...(template.executor === "openclaw" ? ["openclaw"] : ["n8n"]),
      ],
      metadata: {
        templateId: template.id,
        idempotencyKey,
        dispatchStatus: dispatch.status,
        failureClass: dispatch.failureClass || null,
        totalDurationMs: dispatch.totalDurationMs || 0,
        modelUsed: dispatch.modelUsed || null,
        fallbackUsed: Boolean(dispatch.fallbackUsed),
      },
    });

    return {
      statusCode: 200,
      payload: {
        msg:
          template.executor === "openclaw"
            ? "Automation sent to OpenClaw."
            : "Automation dispatched.",
        template: updatedTemplate,
        run: {
          summary:
            template.executor === "openclaw"
              ? `Task sent to OpenClaw.${openClawSummary ? ` Result: ${openClawSummary}` : ""}`
              : "Execution dispatched to n8n. Completion is tracked by downstream workflow/reporting.",
          brief,
          executorPayload,
          reportHref: this.buildReportHref(report.date),
          reportId: report.id,
          workflow: WORKFLOW,
          costRisk,
          promotionStatus: "ready",
          evalGuardWarning: null,
          failureClass: dispatch.failureClass || null,
          attempts: dispatch.attempts || 1,
          totalDurationMs: dispatch.totalDurationMs || 0,
          modelUsed: dispatch.modelUsed || null,
          fallbackUsed: Boolean(dispatch.fallbackUsed),
        },
      },
    };
  }

  async runTemplate(input: {
    projectId?: unknown;
    templateId: string;
  }): Promise<ExecuteResult> {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const templateId = this.s(input.templateId);

    if (!templateId) {
      throw new AutomationTemplateExecuteError({
        message: "Template ID is required.",
        status: 400,
        code: "missing_template_id",
      });
    }

    const template = this.findTemplateById(user.id, projectId, templateId);
    if (!template) {
      throw new AutomationTemplateExecuteError({
        message: "Automation template not found.",
        status: 404,
        code: "template_not_found",
      });
    }

    const brief = this.buildPreparationBrief({
      projectId,
      template,
    });
    const executorPayload = this.buildPreparationExecutorPayload({
      projectId,
      template,
    });

    const runSummary =
      template.executor === "n8n"
        ? "Execution brief prepared for n8n handoff."
        : `Execution brief prepared for ${template.executor}.`;

    const updatedTemplate = this.recordTemplateRun(
      user.id,
      projectId,
      template.id,
      "ready",
      runSummary,
    );

    const report = this.createReport({
      userId: user.id,
      projectId,
      title: `Automation run prepared: ${template.name}`,
      content: brief,
      status: "info",
      area: template.area || "automation",
      topics: [...template.topics, "automation"],
      metadata: {
        executor: template.executor,
        executionEnv: template.executionEnv,
        templateId: template.id,
      },
    });

    return {
      statusCode: 200,
      payload: {
        msg: "Automation run prepared.",
        template: updatedTemplate,
        run: {
          summary: runSummary,
          brief,
          executorPayload,
          reportHref: this.buildReportHref(report.date),
          reportId: report.id,
        },
      },
    };
  }

  async checkTemplate(input: {
    projectId?: unknown;
    templateId: string;
  }): Promise<ExecuteResult> {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const templateId = this.s(input.templateId);

    if (!templateId) {
      throw new AutomationTemplateExecuteError({
        message: "Template ID is required.",
        status: 400,
        code: "missing_template_id",
      });
    }

    const template = this.findTemplateById(user.id, projectId, templateId);
    if (!template) {
      throw new AutomationTemplateExecuteError({
        message: "Automation template not found.",
        status: 404,
        code: "template_not_found",
      });
    }

    const evaluation = this.evaluateTemplate(template);

    this.createTemplateRun({
      userId: user.id,
      projectId,
      templateId: template.id,
      mode: "evaluate",
      status: evaluation.recommendedStatus,
      summary: evaluation.summary,
      request: {
        templateId: template.id,
        templateName: template.name,
        executor: template.executor,
        executionEnv: template.executionEnv,
      },
      response: {
        score: evaluation.score,
        summary: evaluation.summary,
        recommendedStatus: evaluation.recommendedStatus,
        findings: evaluation.findings,
      },
    });

    const updatedTemplate = this.recordTemplateRun(
      user.id,
      projectId,
      template.id,
      evaluation.recommendedStatus,
      evaluation.summary,
    );

    return {
      statusCode: 200,
      payload: {
        msg: "Template check completed.",
        template: updatedTemplate,
        evaluation,
      },
    };
  }

  async listTemplateCatalog(input: { projectId?: unknown }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    return {
      templates: this.listTemplates(user.id, projectId),
    };
  }

  async createTemplateCatalogEntry(input: {
    projectId?: unknown;
    body: Record<string, unknown>;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const name = this.s(input.body.name);
    const prompt = this.s(input.body.prompt);

    if (!name) {
      throw new AutomationTemplateExecuteError({
        message: "Template name is required.",
        status: 400,
        code: "missing_template_name",
      });
    }
    if (!prompt) {
      throw new AutomationTemplateExecuteError({
        message: "Template prompt is required.",
        status: 400,
        code: "missing_template_prompt",
      });
    }

    return {
      msg: "Automation template created.",
      template: this.createTemplate({
        userId: user.id,
        projectId,
        body: input.body,
      }),
    };
  }

  async updateTemplateCatalogEntry(input: {
    projectId?: unknown;
    templateId: string;
    body: Record<string, unknown>;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const templateId = this.s(input.templateId);

    if (!templateId) {
      throw new AutomationTemplateExecuteError({
        message: "Template ID is required.",
        status: 400,
        code: "missing_template_id",
      });
    }

    const template = this.updateTemplate({
      userId: user.id,
      projectId,
      templateId,
      body: input.body,
    });
    if (!template) {
      throw new AutomationTemplateExecuteError({
        message: "Automation template not found.",
        status: 404,
        code: "template_not_found",
      });
    }

    return {
      msg: "Automation template updated.",
      template,
    };
  }

  async deleteTemplateCatalogEntry(input: {
    projectId?: unknown;
    templateId: string;
  }) {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const templateId = this.s(input.templateId);

    if (!templateId) {
      throw new AutomationTemplateExecuteError({
        message: "Template ID is required.",
        status: 400,
        code: "missing_template_id",
      });
    }

    const deleted = this.deleteTemplate(user.id, projectId, templateId);
    if (!deleted) {
      throw new AutomationTemplateExecuteError({
        message: "Automation template not found.",
        status: 404,
        code: "template_not_found",
      });
    }

    return { msg: "Automation template deleted." };
  }

  async listTemplateRunHistory(input: {
    projectId?: unknown;
    templateId: string;
  }): Promise<Record<string, unknown>> {
    const user = this.operator();
    const projectId = this.resolveProjectId(input.projectId);
    const templateId = this.s(input.templateId);

    if (!templateId) {
      throw new AutomationTemplateExecuteError({
        message: "Template ID is required.",
        status: 400,
        code: "missing_template_id",
      });
    }

    const template = this.findTemplateById(user.id, projectId, templateId);
    if (!template) {
      throw new AutomationTemplateExecuteError({
        message: "Automation template not found.",
        status: 404,
        code: "template_not_found",
      });
    }

    return {
      success: true,
      templateId: template.id,
      runs: this.listTemplateRuns(user.id, projectId, template.id, 20),
    };
  }
}
