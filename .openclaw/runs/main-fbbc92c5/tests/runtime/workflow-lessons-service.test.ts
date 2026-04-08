import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  appendLessonEvent,
  loadLessonHint,
  updateWorkflowLessonRules,
} from "../../src/server/services/workflow-lessons-service.ts";

test("workflow lessons promotes repeated failures into bounded rules and logs injection telemetry", async () => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), "mission-control-lessons-"));

  try {
    await appendLessonEvent({
      projectPath,
      runType: "agent",
      issueKey: "agent:test:dispatch",
      summary: "Dispatch failed (502) for Builder agent due to timeout in upstream route.",
      outcome: "failure",
    });
    await appendLessonEvent({
      projectPath,
      runType: "agent",
      issueKey: "agent:test:dispatch",
      summary: "Dispatch failed (502) for Builder agent due to timeout in upstream route.",
      outcome: "failure",
    });

    const snapshot = await updateWorkflowLessonRules({
      projectPath,
      maxCatalogItems: 20,
      promotionThreshold: 2,
    });
    assert.ok(snapshot.active.length >= 1);

    const hint = await loadLessonHint(projectPath, "agent:test:dispatch", {
      source: "tests.workflow-lessons",
      injectTelemetry: true,
    });
    assert.equal(hint.reanalysisRequired, true);
    assert.ok(hint.ruleSnippets.length >= 1);

    const telemetryPath = path.join(projectPath, ".openclaw", "lessons", "runtime-injection-telemetry.jsonl");
    const telemetryLines = readFileSync(telemetryPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    assert.ok(telemetryLines.length >= 1);
    const row = JSON.parse(telemetryLines[telemetryLines.length - 1]) as {
      source?: string;
      rulesInjected?: number;
      snippetsInjected?: number;
    };
    assert.equal(row.source, "tests.workflow-lessons");
    assert.ok(Number(row.rulesInjected || 0) >= 1);
    assert.ok(Number(row.snippetsInjected || 0) >= 1);
  } finally {
    rmSync(projectPath, { recursive: true, force: true });
  }
});
