import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildRepoSourcesOpsReportContent,
  runRepoSourcesRefresh,
  updateRepoSourcesFlags,
} from "../../src/server/services/repo-sources-ops-service.ts";

function makeTempProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-sources-ops-test-"));
  fs.mkdirSync(path.join(root, "reports", "ops"), { recursive: true });
  return {
    projectRoot: root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test("runRepoSourcesRefresh returns busy when operation lock already exists", () => {
  const temp = makeTempProjectRoot();
  try {
    fs.writeFileSync(path.join(temp.projectRoot, "reports", "ops", "repo-sources-op.lock"), "busy", "utf8");
    const result = runRepoSourcesRefresh(temp.projectRoot, {
      mode: "check",
      scope: "all",
      maxAgeHours: 24,
    });

    assert.equal(result.ok, false);
    assert.equal(result.busy, true);
    assert.equal(result.exitCode, 423);
    assert.equal(result.stderr, "repo_sources_operation_in_progress");
  } finally {
    temp.cleanup();
  }
});

test("runRepoSourcesRefresh single scope validates missing target path", () => {
  const temp = makeTempProjectRoot();
  try {
    const result = runRepoSourcesRefresh(temp.projectRoot, {
      mode: "check",
      scope: "single",
    });
    assert.equal(result.ok, false);
    assert.equal(result.busy, false);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /repo_path_required_for_single_scope/);
  } finally {
    temp.cleanup();
  }
});

test("updateRepoSourcesFlags returns busy when lock exists", () => {
  const temp = makeTempProjectRoot();
  try {
    fs.writeFileSync(path.join(temp.projectRoot, "reports", "ops", "repo-sources-op.lock"), "busy", "utf8");
    const result = updateRepoSourcesFlags(temp.projectRoot, {
      repoPath: "projects/tool-a",
      track: false,
      maxAgeHours: 24,
    });
    assert.equal(result.ok, false);
    assert.equal(result.busy, true);
    assert.equal(result.command, "repo_sources_lock");
  } finally {
    temp.cleanup();
  }
});

test("buildRepoSourcesOpsReportContent includes key telemetry fields", () => {
  const content = buildRepoSourcesOpsReportContent({
    mode: "update",
    scope: "single",
    targetPath: "projects/tool-a",
    command: "npm run ops:repo-sources:update --single projects/tool-a",
    exitCode: 0,
    durationMs: 1234,
    snapshot: {
      available: true,
      generatedAt: "2026-03-18T00:00:00.000Z",
      stale: false,
      maxAgeHours: 24,
      ageMinutes: 1,
      summary: {
        total: 5,
        enabled: 5,
        updateAvailable: 1,
        updated: 1,
        upToDate: 3,
        dirtyAllowed: 0,
        dirtyBlocking: 0,
        blocked: 0,
        skipped: 1,
      },
      countsByState: {},
      blockedEntries: [],
    },
  });

  assert.match(content, /Repo sources operation: update/);
  assert.match(content, /scope: single/);
  assert.match(content, /targetPath: projects\/tool-a/);
  assert.match(content, /durationMs: 1234/);
  assert.match(content, /blocked: 0/);
});
