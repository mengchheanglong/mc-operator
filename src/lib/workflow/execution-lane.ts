export type WorkflowExecutionMode = "codex-first" | "hybrid" | "openclaw-first";
export type OpenClawControlRole =
  | "workflow-architect"
  | "task-orchestrator"
  | "ops-monitor"
  | "integration-coordinator";

const CODING_TASK_KEYWORDS = [
  "code",
  "coding",
  "implement",
  "fix",
  "bug",
  "refactor",
  "compile",
  "typecheck",
  "lint",
  "test",
  "build",
  "api",
  "route",
  "component",
  "function",
  "repository",
  "repo",
  "typescript",
  "javascript",
  "python",
  "sql",
  "file",
];

const PLANNING_TASK_KEYWORDS = [
  "plan",
  "roadmap",
  "scope",
  "strategy",
  "prompt",
  "brief",
  "design",
  "architecture",
];

const OPS_TASK_KEYWORDS = [
  "health",
  "status",
  "canary",
  "soak",
  "probe",
  "monitor",
  "monitoring",
  "logs",
  "reliability",
  "alert",
];

const INTEGRATION_TASK_KEYWORDS = [
  "integrate",
  "integration",
  "adapter",
  "bridge",
  "connector",
  "tool",
  "pack",
  "import",
  "sync",
];

function normalizeMode(value: string): WorkflowExecutionMode {
  const normalized = value.trim().toLowerCase();
  if (normalized === "openclaw-first") return "openclaw-first";
  if (normalized === "hybrid") return "hybrid";
  return "codex-first";
}

export function getWorkflowExecutionMode(): WorkflowExecutionMode {
  return normalizeMode(process.env.MISSION_CONTROL_EXECUTION_MODE || "codex-first");
}

export function isCodingTask(task: string) {
  const normalizedTask = String(task || "").toLowerCase();
  return CODING_TASK_KEYWORDS.some((keyword) => normalizedTask.includes(keyword));
}

export function resolveOpenClawControlRole(task: string): OpenClawControlRole {
  const normalizedTask = String(task || "").toLowerCase();
  if (OPS_TASK_KEYWORDS.some((keyword) => normalizedTask.includes(keyword))) {
    return "ops-monitor";
  }
  if (INTEGRATION_TASK_KEYWORDS.some((keyword) => normalizedTask.includes(keyword))) {
    return "integration-coordinator";
  }
  if (PLANNING_TASK_KEYWORDS.some((keyword) => normalizedTask.includes(keyword))) {
    return "workflow-architect";
  }
  return "task-orchestrator";
}

export function getOpenClawRoleDirectives(role: OpenClawControlRole) {
  switch (role) {
    case "workflow-architect":
      return {
        focus: "convert goal into a bounded plan with acceptance criteria",
        constraints: [
          "When coding execution is required, keep scope explicit and verification-first.",
        ],
        executionNotes: [
          "Produce objective, scope boundaries, acceptance checks, and smallest first implementation slice.",
        ],
        reportFormat: ["Plan", "Acceptance checks", "Risks", "Next action lane (Codex/OpenClaw)"],
      };
    case "integration-coordinator":
      return {
        focus: "select and route tools/adapters with bounded contracts",
        constraints: [
          "If code edits are needed, keep contract, validation, and rollback explicit.",
        ],
        executionNotes: [
          "Specify selected tool, why selected, contract fields, and verification gates before execution.",
        ],
        reportFormat: ["Selected tool path", "Dispatch contract", "Verification", "Rollback step"],
      };
    case "ops-monitor":
      return {
        focus: "health/reliability monitoring and incident triage",
        constraints: [
          "Prioritize runtime evidence, logs, and reproducible checks over speculative root-cause claims.",
        ],
        executionNotes: [
          "Collect probe/health evidence, classify failures, and propose smallest safe fix.",
        ],
        reportFormat: ["Health checks", "Observed failures", "Root cause", "Smallest concrete fix"],
      };
    default:
      return {
        focus: "coordinate bounded task execution across lanes and tools",
        constraints: [
          "Keep execution bounded and explicitly choose lane ownership per step.",
        ],
        executionNotes: [
          "Track task state, dependencies, and verification status across runs.",
        ],
        reportFormat: ["Task state", "Dependencies", "Verification status", "Next lane owner"],
      };
  }
}

export function shouldAllowOpenClawFallback(input: {
  task: string;
  allowOpenClawFallback?: boolean;
}) {
  void input;
  return true;
}

export function shouldPreferCodexLane(task: string) {
  return getWorkflowExecutionMode() === "codex-first" && isCodingTask(task);
}

export function codexFirstLaneHintMessage() {
  return "Codex-first preference: coding task detected. OpenClaw execution remains fully available with no scope limit.";
}
