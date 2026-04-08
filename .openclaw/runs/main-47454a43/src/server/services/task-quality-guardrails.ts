export type TaskQualityPayload = {
  objective: string;
  scope: string;
  verificationSteps: string[];
  rollbackPlan: string[];
  outputExpectation: string[];
};

export type TaskQualityIssue = {
  field: keyof TaskQualityPayload;
  rule: string;
  message: string;
  action: string;
};

export type TaskQualityValidationResult = {
  ok: boolean;
  issues: TaskQualityIssue[];
};

export type TaskQualityNormalizedError = {
  code: string;
  reason: string;
  retryable: boolean;
  source: string;
  adapter: string;
};

const BOUNDED_OUTPUT_HINTS = ["max", "at most", "limit", "no more than", "single", "one", "only", "bounded", "<=", "less than"];
const ROLLBACK_HINTS = ["rollback", "revert", "fallback", "stop", "abort", "restore", "escalate"];
const VERIFICATION_HINTS = ["verify", "validation", "test", "check", "assert", "confirm", "lint", "build", "typecheck"];

function normalizedLines(values: string[]) {
  return values.map((value) => String(value || "").replace(/\s+/g, " ").trim()).filter(Boolean);
}

function hasAnyHint(text: string, hints: string[]) {
  const lower = text.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

function hasClearStatement(text: string, minLength: number) {
  return text.replace(/\s+/g, " ").trim().length >= minLength;
}

export function validateTaskQualityPayload(payload: TaskQualityPayload): TaskQualityValidationResult {
  const issues: TaskQualityIssue[] = [];

  const objective = String(payload.objective || "").replace(/\s+/g, " ").trim();
  const scope = String(payload.scope || "").replace(/\s+/g, " ").trim();
  const verificationSteps = normalizedLines(payload.verificationSteps || []);
  const rollbackPlan = normalizedLines(payload.rollbackPlan || []);
  const outputExpectation = normalizedLines(payload.outputExpectation || []);

  if (!hasClearStatement(objective, 16)) {
    issues.push({
      field: "objective",
      rule: "clear-objective",
      message: "Objective must be explicit and at least 16 characters.",
      action: "State the concrete outcome to deliver in one sentence.",
    });
  }

  if (!hasClearStatement(scope, 12)) {
    issues.push({
      field: "scope",
      rule: "clear-scope",
      message: "Scope must define boundaries and be at least 12 characters.",
      action: "Add what is in-scope and what is out-of-scope for this task.",
    });
  }

  if (verificationSteps.length === 0) {
    issues.push({
      field: "verificationSteps",
      rule: "verification-required",
      message: "At least one verification step is required.",
      action: "Add command-level checks (for example: npm run typecheck, npm test).",
    });
  } else if (!verificationSteps.some((step) => hasAnyHint(step, VERIFICATION_HINTS))) {
    issues.push({
      field: "verificationSteps",
      rule: "verification-actionable",
      message: "Verification steps must describe concrete validation actions.",
      action: "Use actionable checks that can be run and evidenced in output.",
    });
  }

  if (rollbackPlan.length === 0) {
    issues.push({
      field: "rollbackPlan",
      rule: "rollback-required",
      message: "A rollback/fallback plan is required.",
      action: "Add a fallback action if execution fails or risks regression.",
    });
  } else if (!rollbackPlan.some((step) => hasAnyHint(step, ROLLBACK_HINTS))) {
    issues.push({
      field: "rollbackPlan",
      rule: "rollback-actionable",
      message: "Rollback/fallback plan must include a recovery action.",
      action: "Include rollback/revert/fallback/stop guidance.",
    });
  }

  if (outputExpectation.length === 0) {
    issues.push({
      field: "outputExpectation",
      rule: "bounded-output-required",
      message: "Bounded output expectation is required.",
      action: "Specify expected outputs with explicit limits.",
    });
  } else if (!outputExpectation.some((step) => hasAnyHint(step, BOUNDED_OUTPUT_HINTS))) {
    issues.push({
      field: "outputExpectation",
      rule: "bounded-output-actionable",
      message: "Output expectation must be explicitly bounded.",
      action: "Include terms like max/at most/only/no more than for output limits.",
    });
  }

  return { ok: issues.length === 0, issues };
}

export function createTaskQualityNormalizedError(input: {
  source: string;
  issues: TaskQualityIssue[];
}): TaskQualityNormalizedError {
  return {
    code: "task_quality_validation_failed",
    reason: input.issues[0]?.message || "Task quality validation failed.",
    retryable: false,
    source: input.source,
    adapter: "task-quality-guardrails",
  };
}

export function buildTaskQualityPayload(input: {
  objective: string;
  scope: string;
  verificationSteps: string[];
  rollbackPlan: string[];
  outputExpectation: string[];
}): TaskQualityPayload {
  return {
    objective: String(input.objective || "").trim(),
    scope: String(input.scope || "").trim(),
    verificationSteps: normalizedLines(input.verificationSteps || []),
    rollbackPlan: normalizedLines(input.rollbackPlan || []),
    outputExpectation: normalizedLines(input.outputExpectation || []),
  };
}
