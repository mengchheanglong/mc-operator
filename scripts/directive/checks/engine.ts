import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DirectiveEngine,
  type DirectiveEngineCapabilityGap,
  createMemoryDirectiveEngineStore,
  createDirectiveWorkspaceEngineLanes,
} from "../../../directive-workspace/engine/index.ts";

async function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const activeMissionPath = path.join(directiveRoot, "knowledge", "active-mission.md");
  const directiveEnginePath = path.join(directiveRoot, "engine", "directive-engine.ts");
  const directiveRoutingPath = path.join(directiveRoot, "engine", "routing.ts");
  const directiveLanesPath = path.join(directiveRoot, "engine", "directive-workspace-lanes.ts");
  const directiveUsefulnessPath = path.join(directiveRoot, "engine", "usefulness.ts");
  const activeMissionMarkdown = fs.readFileSync(activeMissionPath, "utf8");
  const directiveEngineSource = fs.readFileSync(directiveEnginePath, "utf8");
  const directiveRoutingSource = fs.readFileSync(directiveRoutingPath, "utf8");
  const directiveLanesSource = fs.readFileSync(directiveLanesPath, "utf8");
  const directiveUsefulnessSource = fs.readFileSync(directiveUsefulnessPath, "utf8");

  const openGaps: DirectiveEngineCapabilityGap[] = [
    {
      gapId: "gap-directive-engine-discovery-check",
      description:
        "Discovery front door routing coverage still needs bounded engine-native verification.",
      priority: "high",
      relatedMissionObjective:
        "Discovery as operational front door and directive engine materialization",
      currentState:
        "Hosts can still bypass the engine unless the routing path is exercised directly.",
      desiredState:
        "One engine-owned routing path proves discovery intake can remain mission-aware without host-local reconstruction.",
      detectedAt: "2026-03-23",
    },
  ];

  const adapterEvents: string[] = [];
  const store = createMemoryDirectiveEngineStore();
  const engine = new DirectiveEngine({
    laneSet: createDirectiveWorkspaceEngineLanes({
      laneOverrides: {
        forge: {
          nextAction:
            "Tailor Forge follow-up to the host objective without changing the engine API.",
        },
      },
    }),
    store,
    hostAdapters: [
      {
        id: "check-adapter",
        onRunRecorded(record) {
          adapterEvents.push(record.runId);
          return {
            accepted: true,
            note: `recorded ${record.candidate.candidateId}`,
          };
        },
      },
    ],
  });

  const mission = {
    missionId: "active-mission-2026-03-23",
    activeMissionMarkdown,
  };

  const discoveryResult = await engine.processSource({
    source: {
      sourceId: "discovery-front-door-signal",
      sourceType: "internal-signal",
      sourceRef: "signal://directive/discovery/front-door",
      title: "Discovery Front Door Signal",
      summary:
        "Improve discovery intake queue coverage and routing clarity for mission-relevant signals.",
      notes: [
        "front door",
        "intake queue",
        "routing discipline",
        "coverage gap",
      ],
      capabilityGapId: openGaps[0]?.gapId ?? null,
    },
    mission,
    gaps: openGaps,
    receivedAt: "2026-03-23T16:00:00.000Z",
  });

  const architectureResult = await engine.processSource({
    source: {
      sourceId: "architecture-engine-kernel",
      sourceType: "paper",
      sourceRef: "https://example.com/directive-engine-kernel",
      title: "Directive Engine Kernel Pattern",
      summary:
        "Extract reusable engine routing, adaptation, evaluation, and proof logic into product-owned operating code.",
      notes: [
        "engine",
        "schema",
        "contract",
        "adaptation",
        "evaluation",
        "self-improvement",
      ],
    },
    mission,
    receivedAt: "2026-03-23T16:05:00.000Z",
  });

  const forgeResult = await engine.processSource({
    source: {
      sourceId: "forge-runtime-transform",
      sourceType: "github-repo",
      sourceRef: "https://example.com/runtime-transform",
      title: "Runtime Transformation Candidate",
      summary:
        "Turn the same capability into a callable runtime with better implementation shape, lower latency, lower cost, and stronger reliability.",
      notes: [
        "runtime",
        "callable",
        "same capability",
        "better implementation",
        "faster",
        "reliability",
      ],
    },
    mission,
    receivedAt: "2026-03-23T16:10:00.000Z",
  });

  const storedRuns = await engine.listRuns();
  const reloadedArchitectureRun = await engine.getRun(architectureResult.record.runId);

  assert.ok(
    directiveEngineSource.includes("assessDirectiveEngineRouting"),
    "DirectiveEngine should call the Engine-owned routing core",
  );
  assert.ok(
    directiveRoutingSource.includes("export function assessDirectiveEngineRouting"),
    "Engine routing should live in an Engine-owned module",
  );
  assert.ok(
    !directiveLanesSource.includes("assessDiscoveryMissionRouting"),
    "default lane definitions should not depend on Discovery-owned routing helpers",
  );
  assert.ok(
    !directiveLanesSource.includes("route(routeInput)"),
    "default lane definitions should not own the routing entry point",
  );
  assert.ok(
    directiveUsefulnessSource.includes("routingAssessment.scoreBreakdown.metaUsefulnessSignal"),
    "default usefulness classification should consume Engine-owned routing output",
  );
  assert.ok(
    directiveUsefulnessSource.includes("export function classifyDirectiveEngineUsefulness"),
    "default usefulness classification should live in an Engine-owned helper",
  );
  assert.ok(
    directiveUsefulnessSource.includes("export function explainDirectiveEngineUsefulness"),
    "default usefulness rationale should live in an Engine-owned helper",
  );
  assert.ok(
    directiveEngineSource.includes("classifyDirectiveEngineUsefulness"),
    "DirectiveEngine should use the Engine-owned default usefulness classifier",
  );
  assert.ok(
    directiveEngineSource.includes("explainDirectiveEngineUsefulness"),
    "DirectiveEngine should use the Engine-owned default usefulness rationale",
  );
  assert.ok(
    !directiveLanesSource.includes("classifyUsefulness"),
    "default lane definitions should not own the default usefulness classifier",
  );

  assert.equal(discoveryResult.record.candidate.recommendedLaneId, "discovery");
  assert.equal(discoveryResult.record.proofPlan.proofKind, "discovery_review");
  assert.equal(discoveryResult.record.decision.decisionState, "hold_in_discovery");
  assert.equal(discoveryResult.record.integrationProposal.integrationMode, "none");
  assert.equal(discoveryResult.record.integrationProposal.targetLaneId, "discovery");
  assert.equal(discoveryResult.record.reportPlan.reportKind, "discovery_routing_report");
  assert.equal(discoveryResult.record.routingAssessment.matchedGapId, openGaps[0]?.gapId);

  assert.equal(architectureResult.record.candidate.recommendedLaneId, "architecture");
  assert.equal(architectureResult.record.candidate.usefulnessLevel, "meta");
  assert.equal(architectureResult.record.proofPlan.proofKind, "architecture_validation");
  assert.equal(architectureResult.record.decision.decisionState, "accept_for_architecture");
  assert.equal(architectureResult.record.integrationProposal.integrationMode, "adapt");
  assert.equal(architectureResult.record.integrationProposal.hostDependence, "engine_only");
  assert.equal(architectureResult.record.reportPlan.reportKind, "architecture_adaptation_report");
  assert.equal(architectureResult.record.selectedLane.valuableWithoutHostRuntime, true);
  assert.ok(
    architectureResult.record.routingAssessment.scoreBreakdown.metaUsefulnessSignal >= 1,
  );
  assert.ok(
    architectureResult.record.analysis.usefulnessRationale.includes("Meta-usefulness"),
  );
  assert.ok(
    architectureResult.record.reportPlan.usefulnessRationale.includes("Meta-usefulness"),
  );
  assert.ok(
    architectureResult.record.reportPlan.summary.includes("Usefulness rationale:"),
  );

  assert.equal(forgeResult.record.candidate.recommendedLaneId, "forge");
  assert.equal(forgeResult.record.candidate.usefulnessLevel, "direct");
  assert.equal(forgeResult.record.proofPlan.proofKind, "forge_transformation_proof");
  assert.equal(forgeResult.record.decision.decisionState, "route_to_forge_follow_up");
  assert.equal(forgeResult.record.integrationProposal.integrationMode, "reimplement");
  assert.equal(forgeResult.record.integrationProposal.hostDependence, "host_adapter_required");
  assert.equal(forgeResult.record.integrationProposal.valuableWithoutHostRuntime, false);
  assert.equal(forgeResult.record.reportPlan.reportKind, "forge_follow_up_report");
  assert.equal(
    forgeResult.record.integrationProposal.nextAction,
    "Tailor Forge follow-up to the host objective without changing the engine API.",
  );
  assert.ok(forgeResult.record.routingAssessment.scoreBreakdown.transformationSignal >= 1);
  assert.ok(
    forgeResult.record.analysis.usefulnessRationale.includes("Direct usefulness"),
  );

  assert.equal(storedRuns.length, 3);
  assert.ok(reloadedArchitectureRun);
  assert.equal(reloadedArchitectureRun?.runId, architectureResult.record.runId);
  assert.deepEqual(adapterEvents, storedRuns.map((record) => record.runId));
  const expectedEventTypes = [
    "source_ingested",
    "source_analyzed",
    "candidate_routed",
    "value_extracted",
    "value_adapted",
    "value_improved",
    "proof_planned",
    "decision_recorded",
    "integration_proposed",
    "report_planned",
  ];
  assert.ok(
    storedRuns.every((record) => record.events.length === expectedEventTypes.length),
    "each engine run should emit the canonical event chain",
  );
  assert.ok(
    storedRuns.every(
      (record) => JSON.stringify(record.events.map((event) => event.type)) === JSON.stringify(expectedEventTypes),
    ),
    "each engine run should emit the expected source-to-report event sequence",
  );

  const output = {
    ok: true,
    activeMissionPath,
    runs: storedRuns.map((record) => ({
      runId: record.runId,
      candidateId: record.candidate.candidateId,
      lane: record.candidate.recommendedLaneId,
      usefulnessLevel: record.candidate.usefulnessLevel,
      proofKind: record.proofPlan.proofKind,
      decisionState: record.decision.decisionState,
      integrationMode: record.integrationProposal.integrationMode,
      reportKind: record.reportPlan.reportKind,
      hostDependence: record.integrationProposal.hostDependence,
      valuableWithoutHostRuntime: record.integrationProposal.valuableWithoutHostRuntime,
    })),
    adapterEvents,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  const output = {
    ok: false,
    error: String((error as Error).message || error),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(1);
});
