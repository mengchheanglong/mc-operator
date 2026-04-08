import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getRepoSourcesConfigPath,
  readRepoSourcesConfig,
  updateRepoSourcesConfigEntry,
} from "../../src/server/services/repo-sources-config-service.ts";

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-sources-config-test-"));
  const projectRoot = path.join(root, "mission-control");
  fs.mkdirSync(projectRoot, { recursive: true });
  return {
    workspaceRoot: root,
    projectRoot,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function seedConfig(projectRoot: string) {
  const filePath = getRepoSourcesConfigPath(projectRoot);
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        repositories: [
          {
            name: "tool-a",
            path: "projects/tool-a",
            track: true,
            enabled: true,
            allowDirty: false,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return filePath;
}

test("readRepoSourcesConfig resolves from workspace root", () => {
  const temp = makeWorkspace();
  try {
    const filePath = seedConfig(temp.projectRoot);
    assert.equal(filePath, path.join(temp.workspaceRoot, "repo-sources.json"));
    const config = readRepoSourcesConfig(temp.projectRoot);
    assert.equal(config.version, 1);
    assert.equal(config.repositories.length, 1);
    assert.equal(config.repositories[0]?.path, "projects/tool-a");
  } finally {
    temp.cleanup();
  }
});

test("updateRepoSourcesConfigEntry updates track/enabled and persists to disk", () => {
  const temp = makeWorkspace();
  try {
    seedConfig(temp.projectRoot);
    const update = updateRepoSourcesConfigEntry(temp.projectRoot, "projects/tool-a", {
      track: false,
      enabled: false,
    });

    assert.equal(update.entry.track, false);
    assert.equal(update.entry.enabled, false);

    const reloaded = readRepoSourcesConfig(temp.projectRoot);
    assert.equal(reloaded.repositories[0]?.track, false);
    assert.equal(reloaded.repositories[0]?.enabled, false);
  } finally {
    temp.cleanup();
  }
});

test("updateRepoSourcesConfigEntry throws when repo path is missing", () => {
  const temp = makeWorkspace();
  try {
    seedConfig(temp.projectRoot);
    assert.throws(
      () => updateRepoSourcesConfigEntry(temp.projectRoot, "projects/missing", { track: false }),
      /repo_sources_entry_not_found/,
    );
  } finally {
    temp.cleanup();
  }
});
