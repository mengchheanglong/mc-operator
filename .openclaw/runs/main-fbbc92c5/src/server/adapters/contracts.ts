import type { DispatchInput, DispatchResult } from "@/server/services/automation-executor-service";
import type { AgentOrchestratorResult } from "@/server/services/agent-orchestrator-service";
import type { BoundedCodegraphSummary } from "@/server/services/codegraph-summary-service";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface CodegraphAdapterResult {
  block?: BoundedCodegraphSummary;
  reason?: string;
  reasonCode?: string;
}

export function validateN8nInput(input: DispatchInput): string[] {
  const issues: string[] = [];
  if (!String(input.targetUrl || "").trim()) issues.push("targetUrl is required");
  if (!isObject(input.payload)) issues.push("payload must be an object");
  if (!String(input.idempotencyKey || "").trim()) issues.push("idempotencyKey is required");
  return issues;
}

export function validateN8nOutput(output: DispatchResult): string[] {
  const issues: string[] = [];
  if (typeof output.ok !== "boolean") issues.push("ok must be boolean");
  if (!Number.isFinite(output.status)) issues.push("status must be number");
  if (typeof output.body !== "string") issues.push("body must be string");
  return issues;
}

export function validateCodegraphInput(input: { projectRootPath: string }): string[] {
  const issues: string[] = [];
  if (!String(input.projectRootPath || "").trim()) issues.push("projectRootPath is required");
  return issues;
}

export function validateCodegraphOutput(output: CodegraphAdapterResult): string[] {
  const issues: string[] = [];
  const hasBlock = Boolean(output.block);
  const hasReason = Boolean(String(output.reasonCode || "").trim());
  if (!hasBlock && !hasReason) issues.push("output must include block or reasonCode");
  return issues;
}

export function validateExternalRunnerInput(input: { args: string[] }): string[] {
  const issues: string[] = [];
  if (!Array.isArray(input.args) || input.args.length === 0) {
    issues.push("args must be a non-empty string array");
  }
  return issues;
}

export function validateExternalRunnerOutput(output: AgentOrchestratorResult): string[] {
  const issues: string[] = [];
  if (typeof output.ok !== "boolean") issues.push("ok must be boolean");
  if (!Number.isFinite(output.status)) issues.push("status must be number");
  if (!Array.isArray(output.args)) issues.push("args must be an array");
  if (typeof output.body !== "string") issues.push("body must be string");
  if (!(output.sessionId === null || typeof output.sessionId === "string")) {
    issues.push("sessionId must be string or null");
  }
  return issues;
}
