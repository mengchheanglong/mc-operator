import assert from "assert";
import { readFileSync } from "fs";
import {
  codexFirstLaneHintMessage,
  getWorkflowExecutionMode,
  getOpenClawRoleDirectives,
  resolveOpenClawControlRole,
  shouldPreferCodexLane,
  shouldAllowOpenClawFallback,
} from "../src/lib/workflow/execution-lane.ts";

assert.equal(getWorkflowExecutionMode(), "codex-first", "Default execution mode should be codex-first.");
assert.equal(
  shouldAllowOpenClawFallback({ task: "Fix bug in API route and update tests." }),
  true,
  "OpenClaw fallback should remain available for coding tasks.",
);
assert.equal(
  shouldAllowOpenClawFallback({ task: "Summarize project status and plan next steps." }),
  true,
  "Non-coding tasks should still allow OpenClaw fallback in codex-first mode.",
);
assert.equal(
  shouldAllowOpenClawFallback({
    task: "Refactor a TypeScript component and run typecheck.",
    allowOpenClawFallback: true,
  }),
  true,
  "Explicit allowOpenClawFallback should be accepted.",
);
assert.equal(
  shouldPreferCodexLane("Refactor API handlers and run tests."),
  true,
  "Codex-first should still mark coding tasks as Codex-preferred lane.",
);
assert.equal(
  shouldPreferCodexLane("Summarize run status and organize next steps."),
  false,
  "Non-coding tasks should not be marked Codex-preferred.",
);
assert.equal(
  resolveOpenClawControlRole("Plan project roadmap and acceptance criteria."),
  "workflow-architect",
  "Planning tasks should map to workflow-architect role.",
);
assert.equal(
  resolveOpenClawControlRole("Run canary health and inspect reliability logs."),
  "ops-monitor",
  "Ops tasks should map to ops-monitor role.",
);
assert.equal(
  resolveOpenClawControlRole("Integrate tool adapter with run-scoped dispatch."),
  "integration-coordinator",
  "Integration tasks should map to integration-coordinator role.",
);
assert.equal(
  resolveOpenClawControlRole("Coordinate next actions across tasks."),
  "task-orchestrator",
  "Default non-specialized tasks should map to task-orchestrator role.",
);
const opsRoleDirectives = getOpenClawRoleDirectives("ops-monitor");
assert.ok(
  opsRoleDirectives.constraints.length > 0 && opsRoleDirectives.executionNotes.length > 0,
  "Role directives should provide constraints and execution guidance.",
);
assert.match(
  codexFirstLaneHintMessage(),
  /Codex-first preference/i,
  "Lane hint message should communicate preference without blocking.",
);

const dispatchRoute = readFileSync(
  new URL("../src/app/api/agents/[id]/dispatch/route.ts", import.meta.url),
  "utf8",
);
const backendDispatchService = readFileSync(
  new URL("../backend/src/modules/agents-dispatch/agents-dispatch.service.ts", import.meta.url),
  "utf8",
);
assert.match(dispatchRoute, /proxyBackendRequest/, "Dispatch route should proxy to backend endpoint.");
assert.match(
  dispatchRoute,
  /\/agents\/\$\{encodeURIComponent\(id\)\}\/dispatch/,
  "Dispatch route should target backend /agents/:id/dispatch endpoint.",
);
assert.match(
  backendDispatchService,
  /allowOpenClawFallback/,
  "Dispatch service should accept allowOpenClawFallback.",
);
assert.match(
  backendDispatchService,
  /shouldPreferCodexLane\(/,
  "Dispatch service should tag Codex preference for coding tasks.",
);
assert.match(
  backendDispatchService,
  /codexFirstLaneHintMessage\(/,
  "Dispatch service should include non-blocking lane hint in brief construction.",
);
assert.match(
  backendDispatchService,
  /resolveOpenClawControlRole\(/,
  "Dispatch service should classify OpenClaw control role per task.",
);
assert.match(
  backendDispatchService,
  /Execution mode:/,
  "Dispatch service should persist execution mode for operator visibility.",
);

console.log("codex-first workflow check: PASS");
