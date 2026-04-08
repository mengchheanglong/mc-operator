import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyAgencyAgentsFailure,
  normalizeAgencyAgentsFailureClass,
  runAgencyAgentsRollback,
  runAgencyAgentsSync,
} from "../../src/server/services/run-scoped-agency-agents-core.ts";

async function createFile(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

test("classifyAgencyAgentsFailure prioritizes specific classes", () => {
  assert.equal(
    classifyAgencyAgentsFailure({ invalidInput: true }),
    "invalid_input",
  );
  assert.equal(
    classifyAgencyAgentsFailure({ sourceMissing: true }),
    "source_missing",
  );
  assert.equal(
    classifyAgencyAgentsFailure({ snapshotMissing: true }),
    "snapshot_missing",
  );
  assert.equal(classifyAgencyAgentsFailure({ timedOut: true }), "timeout");
  assert.equal(classifyAgencyAgentsFailure({}), "execution_failed");
});

test("normalizeAgencyAgentsFailureClass maps known error signatures", () => {
  assert.equal(
    normalizeAgencyAgentsFailureClass(
      new Error("invalid_input: sourceRoot and targetRoot are required"),
    ),
    "invalid_input",
  );
  assert.equal(
    normalizeAgencyAgentsFailureClass(
      new Error("source_missing: agency-agents source not found"),
    ),
    "source_missing",
  );
  assert.equal(
    normalizeAgencyAgentsFailureClass(
      new Error("snapshot_missing: no snapshots available"),
    ),
    "snapshot_missing",
  );
  assert.equal(
    normalizeAgencyAgentsFailureClass(new Error("timeout: sync exceeded")),
    "timeout",
  );
  assert.equal(
    normalizeAgencyAgentsFailureClass(new Error("something else failed")),
    "execution_failed",
  );
});

test("runAgencyAgentsSync supports profile filtering and manifest hash output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agency-agents-core-"));
  const sourceRoot = path.join(root, "source");
  const targetRoot = path.join(root, "target");
  const snapshotRoot = path.join(root, "snapshots");

  await createFile(path.join(sourceRoot, "README.md"), "# root readme\n");
  await createFile(path.join(sourceRoot, "engineering", "dev.md"), "# engineering\n");
  await createFile(path.join(sourceRoot, "testing", "qa.md"), "# testing\n");
  await createFile(path.join(sourceRoot, "marketing", "gtm.md"), "# marketing\n");

  const result = await runAgencyAgentsSync({
    sourceRoot,
    targetRoot,
    snapshotRoot,
    timeoutMs: 20_000,
    profile: "engineering",
  });

  assert.equal(result.action, "sync");
  assert.equal(result.summary.profile, "engineering");
  assert.ok(result.summary.selectedDirectories.includes("engineering"));
  assert.equal(result.summary.selectedDirectories.includes("marketing"), false);
  assert.ok(existsSync(path.join(targetRoot, "README.md")));
  assert.ok(existsSync(path.join(targetRoot, "engineering", "dev.md")));
  assert.equal(existsSync(path.join(targetRoot, "marketing", "gtm.md")), false);
  assert.equal(result.summary.manifestHash.length, 64);
  assert.ok(existsSync(result.summary.manifestPath));
  assert.ok(result.summary.postSnapshot?.snapshotId);
});

test("runAgencyAgentsRollback can restore previous snapshot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agency-agents-rollback-"));
  const sourceRoot = path.join(root, "source");
  const targetRoot = path.join(root, "target");
  const snapshotRoot = path.join(root, "snapshots");

  await createFile(path.join(sourceRoot, "engineering", "role.md"), "version-a\n");
  const first = await runAgencyAgentsSync({
    sourceRoot,
    targetRoot,
    snapshotRoot,
    timeoutMs: 20_000,
    profile: "engineering",
  });
  assert.ok(first.summary.postSnapshot?.snapshotId);
  await createFile(path.join(sourceRoot, "engineering", "role.md"), "version-b\n");

  const second = await runAgencyAgentsSync({
    sourceRoot,
    targetRoot,
    snapshotRoot,
    timeoutMs: 20_000,
    profile: "engineering",
  });
  const preSnapshotId = second.summary.preSnapshot?.snapshotId;
  assert.ok(preSnapshotId);

  const rollback = await runAgencyAgentsRollback({
    targetRoot,
    snapshotRoot,
    timeoutMs: 20_000,
    snapshotId: preSnapshotId,
    dryRun: false,
  });

  assert.equal(rollback.action, "rollback");
  assert.equal(rollback.summary.restoredSnapshot.snapshotId, preSnapshotId);
  const restored = await readFile(path.join(targetRoot, "engineering", "role.md"), "utf8");
  assert.equal(restored, "version-a\n");
});
