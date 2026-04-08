import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  readDirectiveEngineRunDetail,
  readDirectiveEngineRunsOverview,
} from "../src/server/services/directive-engine-run-read-service";
import { resolveDirectiveWorkspaceRoot } from "../src/server/paths/directive-workspace-root";

function sanitizeSegment(value: string) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function writeEngineRunArtifacts(input: {
  directiveRoot: string;
  record: Awaited<ReturnType<DirectiveEngine["processSource"]>>["record"];
}) {
  const engineRunsRoot = path.join(
    input.directiveRoot,
    "runtime",
    "standalone-host",
    "engine-runs",
  );
  fs.mkdirSync(engineRunsRoot, { recursive: true });

  const timestamp = input.record.receivedAt.replace(/[:.]/g, "-");
  const candidateSegment =
    sanitizeSegment(input.record.candidate.candidateId)
    || sanitizeSegment(input.record.runId)
    || "directive-engine-run";
  const baseName = `${timestamp}-${candidateSegment}-${input.record.runId.slice(0, 8).toLowerCase()}`;
  const recordPath = path.join(engineRunsRoot, `${baseName}.json`);
  const reportPath = path.join(engineRunsRoot, `${baseName}.md`);

  fs.writeFileSync(recordPath, `${JSON.stringify(input.record, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    reportPath,
    [
      "# Directive Engine Run",
      "",
      `- Run ID: \`${input.record.runId}\``,
      "",
      "## Usefulness Rationale",
      "",
      input.record.analysis.usefulnessRationale,
      "",
      "## Report Summary",
      "",
      input.record.reportPlan.summary,
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    recordPath,
    reportPath,
  };
}

async function main() {
  const directiveRoot = resolveDirectiveWorkspaceRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dw-mc-engine-runs-"));
  const tempDirectiveRoot = path.join(tempRoot, "directive-workspace");
  const panelPath = path.join(
    process.cwd(),
    "src",
    "app",
    "dashboard",
    "directive-workspace",
    "EngineRunsOverviewPanel.tsx",
  );
  const submissionPanelPath = path.join(
    process.cwd(),
    "src",
    "app",
    "dashboard",
    "directive-workspace",
    "DiscoverySubmissionPanel.tsx",
  );
  const pagePath = path.join(
    process.cwd(),
    "src",
    "app",
    "dashboard",
    "directive-workspace",
    "page.tsx",
  );
  const detailPagePath = path.join(
    process.cwd(),
    "src",
    "app",
    "dashboard",
    "directive-workspace",
    "engine-runs",
    "[runId]",
    "page.tsx",
  );
  const hostNotesPath = path.join(directiveRoot, "hosts", "mission-control.md");

  const engineModule = await import(
    pathToFileURL(path.join(directiveRoot, "engine", "index.ts")).href
  );
  const DirectiveEngine = engineModule.DirectiveEngine as new (input: {
    laneSet: unknown;
  }) => {
    processSource: (input: unknown) => Promise<{
      record: {
        runId: string;
        receivedAt: string;
        candidate: {
          candidateId: string;
          usefulnessLevel: string;
        };
        analysis: {
          usefulnessRationale: string;
        };
        reportPlan: {
          summary: string;
        };
        decision: {
          decisionState: string;
        };
      };
    }>;
  };
  const createDirectiveWorkspaceEngineLanes =
    engineModule.createDirectiveWorkspaceEngineLanes as () => unknown;

  const engine = new DirectiveEngine({
    laneSet: createDirectiveWorkspaceEngineLanes(),
  });

  try {
    const mission = {
      missionId: "mc-engine-runs-check",
      currentObjective:
        "Prove Mission Control can consume persisted Directive Engine runs as a read-only host artifact surface.",
      usefulnessSignals: ["engine-native output", "host artifact consumption"],
      capabilityLanes: [
        "Discovery lane intake and routing",
        "Architecture lane engine self-improvement",
        "Forge lane runtime usefulness conversion",
      ],
      activeMissionMarkdown:
        "# Active Mission\n\nMaterialize one real host-facing consumer for persisted Directive Engine runs.",
    };

    const discoveryResult = await engine.processSource({
      source: {
        sourceId: "mc-engine-discovery",
        sourceType: "internal-signal",
        sourceRef: "signal://directive/discovery/front-door",
        title: "Mission Control Discovery Engine Consumer",
        summary:
          "Keep source entry at Discovery while proving the host can read the full Engine run record afterward.",
        notes: ["discovery", "front door", "host consumer"],
      },
      mission,
      receivedAt: "2026-03-24T09:00:00.000Z",
    });

    const architectureResult = await engine.processSource({
      source: {
        sourceId: "mc-engine-architecture",
        sourceType: "paper",
        sourceRef: "https://example.com/engine-architecture",
        title: "Engine Architecture Candidate",
        summary:
          "Improve routing quality, usefulness adaptation, and long-term Engine self-improvement.",
        notes: ["architecture", "engine", "self-improvement", "adaptation"],
      },
      mission,
      receivedAt: "2026-03-24T10:00:00.000Z",
    });

    const forgeResult = await engine.processSource({
      source: {
        sourceId: "mc-engine-forge",
        sourceType: "github-repo",
        sourceRef: "https://example.com/forge-runtime",
        title: "Forge Runtime Candidate",
        summary:
          "Convert extracted value into a reusable runtime capability with stronger implementation shape.",
        notes: ["runtime", "callable", "transformation", "reliability"],
      },
      mission,
      receivedAt: "2026-03-24T11:00:00.000Z",
    });

    writeEngineRunArtifacts({
      directiveRoot: tempDirectiveRoot,
      record: discoveryResult.record,
    });
    writeEngineRunArtifacts({
      directiveRoot: tempDirectiveRoot,
      record: architectureResult.record,
    });
    writeEngineRunArtifacts({
      directiveRoot: tempDirectiveRoot,
      record: forgeResult.record,
    });

    const overview = readDirectiveEngineRunsOverview({
      directiveRoot: tempDirectiveRoot,
      maxRuns: 2,
    });
    const detail = readDirectiveEngineRunDetail({
      directiveRoot: tempDirectiveRoot,
      runId: forgeResult.record.runId,
    });
    const records = [
      discoveryResult.record,
      architectureResult.record,
      forgeResult.record,
    ];
    const expectedMetaCount = records.filter(
      (record) => record.candidate.usefulnessLevel === "meta",
    ).length;
    const expectedDirectCount = records.filter(
      (record) => record.candidate.usefulnessLevel === "direct",
    ).length;
    const expectedHoldInDiscoveryCount = records.filter(
      (record) => record.decision.decisionState === "hold_in_discovery",
    ).length;
    const expectedRouteToForgeCount = records.filter(
      (record) => record.decision.decisionState === "route_to_forge_follow_up",
    ).length;
    const expectedAcceptForArchitectureCount = records.filter(
      (record) => record.decision.decisionState === "accept_for_architecture",
    ).length;
    const panelSource = fs.readFileSync(panelPath, "utf8");
    const submissionPanelSource = fs.readFileSync(submissionPanelPath, "utf8");
    const pageSource = fs.readFileSync(pagePath, "utf8");
    const detailPageSource = fs.readFileSync(detailPagePath, "utf8");
    const hostNotesSource = fs.readFileSync(hostNotesPath, "utf8");

    assert.equal(overview.ok, true);
    assert.equal(overview.totalRuns, 3);
    assert.equal(overview.counts.discovery, 1);
    assert.equal(overview.counts.architecture, 1);
    assert.equal(overview.counts.forge, 1);
    assert.equal(overview.counts.direct, expectedDirectCount);
    assert.equal(overview.counts.meta, expectedMetaCount);
    assert.equal(overview.counts.holdInDiscovery, expectedHoldInDiscoveryCount);
    assert.equal(overview.counts.routeToForge, expectedRouteToForgeCount);
    assert.equal(
      overview.counts.acceptForArchitecture,
      expectedAcceptForArchitectureCount,
    );
    assert.equal(overview.invalidArtifacts, 0);
    assert.equal(overview.recentRuns.length, 2);
    assert.equal(overview.recentRuns[0]?.record.candidate.recommendedLaneId, "forge");
    assert.equal(overview.recentRuns[1]?.record.candidate.recommendedLaneId, "architecture");
    assert.ok(
      typeof overview.recentRuns[0]?.record.analysis.usefulnessRationale === "string",
    );
    assert.ok(typeof overview.recentRuns[0]?.reportExcerpt === "string");
    assert.equal(detail.ok, true);
    assert.equal(detail.record?.runId, forgeResult.record.runId);
    assert.equal(
      detail.record?.analysis.usefulnessRationale,
      forgeResult.record.analysis.usefulnessRationale,
    );
    assert.equal(detail.reportPath?.endsWith(".md"), true);
    assert.ok(typeof detail.reportContent === "string");
    assert.ok(
      overview.latest.recordPath?.includes("/runtime/standalone-host/engine-runs/"),
    );
    assert.ok(
      panelSource.includes("readDirectiveEngineRunsOverview"),
      "Engine runs panel should consume the read service directly",
    );
    assert.ok(
      panelSource.includes("/dashboard/directive-workspace/engine-runs/"),
      "Engine runs overview should link to the detail surface",
    );
    assert.ok(
      submissionPanelSource.includes("/dashboard/directive-workspace/engine-runs/"),
      "Discovery submission success state should link to the Engine run detail surface",
    );
    assert.ok(
      pageSource.includes("EngineRunsOverviewPanel"),
      "Directive Workspace dashboard page should include the Engine runs panel",
    );
    assert.ok(
      detailPageSource.includes("readDirectiveEngineRunDetail"),
      "Engine run detail page should read the detail service directly",
    );
    assert.ok(
      hostNotesSource.includes("producer/consumer"),
      "Mission Control host notes should describe the Engine-runs producer/consumer surface",
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          metrics: {
            totalRuns: overview.totalRuns,
          recentRuns: overview.recentRuns.length,
          detailRunId: detail.record?.runId ?? null,
          discovery: overview.counts.discovery,
          architecture: overview.counts.architecture,
          forge: overview.counts.forge,
          },
          latest: overview.latest,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        error: String((error as Error).message || error),
        stack: error instanceof Error ? error.stack || null : null,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
