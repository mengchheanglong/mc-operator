import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { startDirectiveArchitectureFromHandoff } from "../src/server/services/directive-architecture-handoff-start-service";

function writeUtf8(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function main() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "dw-architecture-handoff-start-"),
  );
  const directiveRoot = path.join(tempRoot, "directive-workspace");
  const handoffRelativePath =
    "architecture/02-experiments/2026-03-24-sample-engine-handoff.md";
  const handoffAbsolutePath = path.join(directiveRoot, handoffRelativePath);

  writeUtf8(
    handoffAbsolutePath,
    [
      "# Sample Engine Handoff Engine-Routed Architecture Experiment",
      "",
      "Date: 2026-03-24",
      "Track: Architecture",
      "Type: engine-routed handoff",
      "Status: pending_review",
      "",
      "## Source",
      "",
      "- Candidate id: `sample-engine-handoff`",
      "- Source reference: `https://example.com/source`",
      "- Engine run record: `runtime/standalone-host/engine-runs/sample.json`",
      "- Engine run report: `runtime/standalone-host/engine-runs/sample.md`",
      "- Discovery routing record: `discovery/routing-log/sample-routing-record.md`",
      "- Usefulness level: `meta`",
      "- Usefulness rationale: Meta-usefulness from shared Engine judgment.",
      "",
      "## Objective",
      "",
      "Materialize one bounded Directive-owned Architecture slice.",
      "",
      "## Bounded scope",
      "",
      "- Keep this to one experiment.",
      "- Preserve human review.",
      "",
      "## Inputs",
      "",
      "- extracted mechanism one",
      "- extracted mechanism two",
      "",
      "## Validation gate(s)",
      "",
      "- `adaptation_complete`",
      "- `decision_review`",
      "",
      "## Lifecycle classification",
      "",
      "- Origin: `source-driven`",
      "- Usefulness level: `meta`",
      "- Forge threshold check: Would this mechanism still be valuable without a runtime surface? `yes`",
      "",
      "## Rollback",
      "",
      "Leave the candidate at experiment status only.",
      "",
      "## Next decision",
      "",
      "- `needs-more-evidence`",
      "",
    ].join("\n"),
  );

  const first = startDirectiveArchitectureFromHandoff({
    handoffPath: handoffRelativePath,
    directiveRoot,
    startedBy: "check-runner",
  });
  const second = startDirectiveArchitectureFromHandoff({
    handoffPath: handoffRelativePath,
    directiveRoot,
    startedBy: "check-runner",
  });

  const startContent = fs.readFileSync(first.startAbsolutePath, "utf8");

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.startRelativePath, second.startRelativePath);
  assert.match(first.startRelativePath, /-bounded-start\.md$/);
  assert.match(startContent, /Start approval: approved by check-runner/);
  assert.match(startContent, /Handoff stub: `architecture\/02-experiments\/2026-03-24-sample-engine-handoff\.md`/);
  assert.match(startContent, /Materialize one bounded Directive-owned Architecture slice\./);
  assert.match(startContent, /Next decision: `needs-more-evidence`/);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        metrics: {
          handoffPath: handoffRelativePath,
          startPath: first.startRelativePath,
          firstCreated: first.created,
          secondCreated: second.created,
        },
      },
      null,
      2,
    )}\n`,
  );
}

main();
