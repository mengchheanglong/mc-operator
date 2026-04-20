import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("package.json exposes the product verification gate and drops stale scripts", () => {
  const pkg = JSON.parse(read("package.json")) as {
    name?: string;
    scripts?: Record<string, string>;
  };

  assert.equal(pkg.name, "mc-operator");
  assert.equal(typeof pkg.scripts?.["verify:product"], "string");
  assert.equal(pkg.scripts?.start, "node ./.next/standalone/server.js");
  assert.match(pkg.scripts?.build || "", /prepare-standalone/);
  assert.equal(pkg.scripts?.["dev:openclaw"], undefined);
  assert.equal(pkg.scripts?.["check:agents-ui"], undefined);
  assert.equal(pkg.scripts?.["check:codex-first-workflow"], undefined);
  assert.equal(pkg.scripts?.["check:workflow-scripts"], undefined);
  assert.equal(pkg.scripts?.["check:legacy-removal-readiness"], undefined);
});

test("ui smoke runner covers the active operator routes", () => {
  const smoke = read("scripts/ui/run-smoke.ts");

  for (const route of [
    "/health",
    "/quests",
    "/reports",
    "/docs",
    "/notes",
    "/projects",
    "/views",
    "/agents",
    "/automation",
    "/ops",
    "/workspace/bootstrap",
    "/directive",
  ]) {
    assert.match(smoke, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("release docs describe the current product gate", () => {
  assert.match(read("README.md"), /verify:product/);
  assert.doesNotMatch(read("README.md"), /agentic-workspace/);
  assert.match(read("docs/RELEASE_CHECKLIST.md"), /verify:product/);
  assert.match(read("docs/operations/UI_SMOKE_GUARDRAILS.md"), /\/workspace\/bootstrap/);
  assert.match(read(".gitignore"), /reports\/ui-smoke\//);
  assert.match(read(".gitignore"), /\.openclaw\/runs\//);
  assert.match(read("src/state/app-store.ts"), /activeProject:\s*'mc-operator'/);
  assert.equal(
    fs.existsSync(path.join(root, "docs", "operations", "AUTOMATION_TASK_SURFACE_INVENTORY.md")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, "docs", "operations", "READ_FALLBACK_CUTOVER_DECISION.md")),
    false,
  );
});
