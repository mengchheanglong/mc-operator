import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("backend smoke exercises the current workflow surface", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-operator-backend-smoke-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const sampleProjectRoot = path.join(workspaceRoot, "sample-project");
  const sampleProjectAltRoot = path.join(workspaceRoot, "sample-project-alt");
  const dataRoot = path.join(tempRoot, "data");

  fs.mkdirSync(sampleProjectRoot, { recursive: true });
  fs.mkdirSync(sampleProjectAltRoot, { recursive: true });
  fs.mkdirSync(dataRoot, { recursive: true });

  fs.writeFileSync(
    path.join(sampleProjectRoot, "package.json"),
    JSON.stringify({ name: "sample-project", private: true }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(sampleProjectAltRoot, "package.json"),
    JSON.stringify({ name: "sample-project-alt", private: true }, null, 2),
    "utf8",
  );
  fs.mkdirSync(path.join(sampleProjectRoot, ".git"), { recursive: true });
  fs.mkdirSync(path.join(sampleProjectAltRoot, ".git"), { recursive: true });

  const sharedOptions = {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      OPENCLAW_WORKSPACE_ROOT: workspaceRoot,
      MISSION_CONTROL_DATA_DIR: dataRoot,
    },
    encoding: "utf8" as const,
    stdio: ["ignore", "pipe", "pipe"] as const,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  };

  const output =
    process.platform === "win32"
      ? execFileSync("cmd.exe", ["/d", "/s", "/c", "npm --prefix ./backend run smoke"], sharedOptions)
      : execFileSync("npm", ["--prefix", "./backend", "run", "smoke"], sharedOptions);

  const summaryMatch = output.match(/\{\s*"ok":[\s\S]*\}\s*$/);
  assert.ok(summaryMatch, "backend smoke should end with a JSON summary");

  const summary = JSON.parse(summaryMatch[0]) as {
    ok: boolean;
    reportCreateStatus?: number;
    questCompleteStatus?: number;
    docUpdateStatus?: number;
    automationRunCloseStatus?: number;
    activeProjectSetStatus?: number;
    activeProjectGetStatus?: number;
    activeProjectId?: string;
    lifecycleStatus?: string | null;
  };

  assert.equal(summary.ok, true);
  assert.equal(summary.reportCreateStatus, 200);
  assert.equal(summary.questCompleteStatus, 200);
  assert.equal(summary.docUpdateStatus, 200);
  assert.equal(summary.automationRunCloseStatus, 200);
  assert.equal(summary.activeProjectSetStatus, 200);
  assert.equal(summary.activeProjectGetStatus, 200);
  assert.equal(typeof summary.activeProjectId, "string");
  assert.equal(typeof summary.lifecycleStatus, "string");
});
