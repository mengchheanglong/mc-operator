import test from "node:test";
import assert from "node:assert/strict";
import {
  isDeprecatedRunScopedTool,
  normalizeRunScopedToolInvocation,
  resolveCanonicalRunScopedToolId,
  resolveRunScopedToolId,
} from "../../src/server/services/run-scoped-tools-core.ts";

test("resolveRunScopedToolId blocks non-allowlisted tool ids", () => {
  assert.throws(() => resolveRunScopedToolId("sync-curated-packs"), /invalid_input: unsupported toolId/);
  assert.equal(resolveRunScopedToolId("tooling-audit"), "tooling-audit");
  assert.equal(resolveRunScopedToolId("desloppify-prototype"), "desloppify-prototype");
  assert.equal(resolveRunScopedToolId("agency-agents"), "agency-agents");
  assert.equal(resolveCanonicalRunScopedToolId("tooling-audit"), "desloppify-prototype");
  assert.equal(resolveCanonicalRunScopedToolId("desloppify-prototype"), "desloppify-prototype");
  assert.equal(isDeprecatedRunScopedTool("tooling-audit"), true);
  assert.equal(isDeprecatedRunScopedTool("desloppify-prototype"), false);
});

test("normalizeRunScopedToolInvocation keeps telemetry and run linkage fields", () => {
  const output = normalizeRunScopedToolInvocation({
    toolId: "tooling-audit",
    result: {
      ok: true,
      runId: "run-123",
      dispatchId: "dispatch-456",
      artifactPath: "C:/artifact.md",
      reportId: "report-789",
      reportHref: "/dashboard/report?day=2026-03-17",
      durationMs: 321,
      failureClass: null,
      status: "success",
      precheck: {
        minChars: 120,
        actualChars: 184,
        triggered: false,
      },
    },
    dispatch: {
      id: "dispatch-456",
      userId: "user-1",
      projectId: "mission-control",
      runId: "run-123",
      agentId: "tooling-audit",
      sessionId: null,
      model: null,
      startedAt: "2026-03-17T00:00:00.000Z",
      finishedAt: "2026-03-17T00:00:01.000Z",
      status: "success",
      failureClass: null,
      command: "powershell -File audit-tooling.ps1",
      reportId: "report-789",
      artifactPath: "C:/artifact.md",
      metadata: {
        runContext: {
          runId: "run-123",
          worktreePath: "C:/worktree",
        },
      },
    },
  });

  assert.equal(output.runId, "run-123");
  assert.equal(output.dispatchId, "dispatch-456");
  assert.equal(output.reportId, "report-789");
  assert.equal(output.artifactPath, "C:/artifact.md");
  assert.equal(output.canonicalToolId, "desloppify-prototype");
  assert.equal(output.deprecated, true);
  assert.equal(output.toolId, "tooling-audit");
  assert.equal(output.runContext.runId, "run-123");
  assert.equal(output.runContext.worktreePath, "C:/worktree");
  assert.equal(output.precheck?.minChars, 120);
  assert.equal(output.precheck?.actualChars, 184);
  assert.equal(output.precheck?.triggered, false);
});
