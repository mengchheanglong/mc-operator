import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readOpsHealthSnapshot } from "../../src/server/services/ops-health-service.ts";

function makeProjectRoot() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ops-health-test-"));
  fs.mkdirSync(path.join(projectRoot, "reports", "ops"), { recursive: true });
  return {
    projectRoot,
    cleanup: () => fs.rmSync(projectRoot, { recursive: true, force: true }),
  };
}

test("readOpsHealthSnapshot reports unavailable when files are missing", () => {
  const temp = makeProjectRoot();
  try {
    const snapshot = readOpsHealthSnapshot(temp.projectRoot, { maxAgeHours: 30 });
    assert.equal(snapshot.items.repoSources.available, false);
    assert.equal(snapshot.items.canary.available, false);
    assert.equal(snapshot.items.workspaceHealth.available, false);
    assert.equal(snapshot.items.nightlyBundle.available, false);
    assert.equal(snapshot.overallOk, null);
  } finally {
    temp.cleanup();
  }
});

test("readOpsHealthSnapshot returns overall ok when all health artifacts are healthy", () => {
  const temp = makeProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    const generatedAt = new Date().toISOString();
    const write = (file: string, payload: unknown) =>
      fs.writeFileSync(path.join(reportsDir, file), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    write("repo-sync-latest.json", {
      generatedAt,
      summary: { total: 1, enabled: 1, updateAvailable: 0, blocked: 0, skipped: 0 },
      countsByState: { up_to_date: 1 },
      repositories: [{ name: "repo", path: "/tmp/repo", state: "up_to_date" }],
    });
    write("canary-latest.json", {
      generatedAt,
      ok: true,
      failedCriticalCount: 0,
      checks: [],
    });
    write("workspace-global-health-latest.json", {
      generatedAt,
      ok: true,
      summary: {
        runtimeChecks: { total: 4, passed: 4 },
        projects: { total: 3, healthy: 3 },
      },
    });
    write("nightly-ops-bundle-latest.json", {
      generatedAt,
      ok: true,
      failedCount: 0,
      steps: [
        { id: "repo_sources_nightly", ok: true },
        { id: "workspace_health_nightly", ok: true },
        { id: "canary_nightly", ok: true },
        { id: "orchestrator_nightly", ok: true },
      ],
    });
    write("repo-sources-nightly-latest.json", {
      generatedAt,
      ok: true,
      blockedCount: 0,
      failureSignature: "healthy",
    });
    write("orchestrator-nightly-latest.json", {
      generatedAt,
      ok: true,
      steps: [{ ok: true }],
    });

    const snapshot = readOpsHealthSnapshot(temp.projectRoot, { maxAgeHours: 30 });
    assert.equal(snapshot.items.repoSources.ok, true);
    assert.equal(snapshot.items.canary.ok, true);
    assert.equal(snapshot.items.workspaceHealth.ok, true);
    assert.equal(snapshot.items.nightlyBundle.ok, true);
    assert.equal(snapshot.overallOk, true);
  } finally {
    temp.cleanup();
  }
});
