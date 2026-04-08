import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readRepoSourcesLatestReport } from "../../src/server/services/repo-sources-report-service.ts";

function makeTempProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-sources-report-test-"));
  return {
    projectRoot: root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test("readRepoSourcesLatestReport returns unavailable snapshot when latest report is missing", () => {
  const temp = makeTempProjectRoot();
  try {
    const snapshot = readRepoSourcesLatestReport(temp.projectRoot, { maxAgeHours: 12 });
    assert.equal(snapshot.available, false);
    assert.equal(snapshot.stale, true);
    assert.equal(snapshot.maxAgeHours, 12);
    assert.equal(snapshot.summary.total, 0);
    assert.equal(snapshot.blockedEntries.length, 0);
  } finally {
    temp.cleanup();
  }
});

test("readRepoSourcesLatestReport parses blocked entries and marks stale based on max age", () => {
  const temp = makeTempProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    fs.mkdirSync(reportsDir, { recursive: true });

    const generatedAt = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const payload = {
      generatedAt,
      summary: {
        total: 3,
        enabled: 3,
        updateAvailable: 1,
        updated: 0,
        upToDate: 1,
        dirtyAllowed: 0,
        dirtyBlocking: 0,
        blocked: 1,
        skipped: 1,
      },
      countsByState: {
        up_to_date: 1,
        update_available: 1,
        pull_failed: 1,
      },
      repositories: [
        { name: "a", path: "/tmp/a", state: "up_to_date" },
        { name: "b", path: "/tmp/b", state: "update_available" },
        {
          name: "c",
          path: "/tmp/c",
          state: "pull_failed",
          error: "ff-only failed",
          command: "git pull --ff-only",
          remoteUrl: "https://example/repo.git",
          currentBranch: "main",
          dirty: false,
          ahead: 0,
          behind: 2,
        },
      ],
    };

    fs.writeFileSync(
      path.join(reportsDir, "repo-sync-latest.json"),
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );

    const snapshot = readRepoSourcesLatestReport(temp.projectRoot, { maxAgeHours: 24 });
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.stale, true);
    assert.equal(snapshot.summary.blocked, 1);
    assert.equal(snapshot.countsByState.pull_failed, 1);
    assert.equal(snapshot.blockedEntries.length, 1);
    assert.equal(snapshot.blockedEntries[0]?.path, "/tmp/c");
    assert.equal(snapshot.blockedEntries[0]?.state, "pull_failed");
  } finally {
    temp.cleanup();
  }
});

test("readRepoSourcesLatestReport treats invalid generatedAt as stale", () => {
  const temp = makeTempProjectRoot();
  try {
    const reportsDir = path.join(temp.projectRoot, "reports", "ops");
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportsDir, "repo-sync-latest.json"),
      JSON.stringify({
        generatedAt: "not-a-date",
        summary: { total: 1, enabled: 1, blocked: 0 },
        repositories: [{ name: "a", path: "/tmp/a", state: "up_to_date" }],
      }),
      "utf8",
    );

    const snapshot = readRepoSourcesLatestReport(temp.projectRoot, { maxAgeHours: 24 });
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.stale, true);
    assert.equal(snapshot.ageMinutes, null);
  } finally {
    temp.cleanup();
  }
});
