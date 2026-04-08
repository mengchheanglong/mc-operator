import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assessDiscoveryMissionRouting } from "../src/lib/directive-workspace/discovery-mission-routing";
import { resolveDirectiveWorkspaceRoot } from "../src/server/paths/directive-workspace-root";
import { submitDiscoveryEntry } from "../src/server/services/directive-discovery-submission-service";
import type { DiscoverySubmissionRequest } from "../src/lib/directive-workspace/discovery-submission-router";
import type { CapabilityGapRecord } from "../src/lib/directive-workspace/discovery-gap-worklist-generator";

function assertCondition(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson<T>(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const directiveRoot = resolveDirectiveWorkspaceRoot();
  const gapsPath = path.join(directiveRoot, "discovery", "capability-gaps.json");
  const missionPath = path.join(directiveRoot, "knowledge", "active-mission.md");

  const gapsDocument = readJson<{ gaps: CapabilityGapRecord[] }>(gapsPath);
  const activeMissionMarkdown = fs.readFileSync(missionPath, "utf8");
  const issues: string[] = [];
  const frontDoorGap = gapsDocument.gaps.find(
    (gap) => gap.gap_id === "gap-discovery-front-door-coverage",
  );
  const missionRoutingGaps = frontDoorGap
    ? [{ ...frontDoorGap, resolved_at: null, resolution_notes: null }]
    : [];

  if (!frontDoorGap) {
    issues.push("missing front-door gap fixture source in capability-gaps.json");
  }

  const discoveryRequest: DiscoverySubmissionRequest = {
    candidate_id: "dw-routing-discovery-signal",
    candidate_name: "Discovery Front Door Signal",
    source_type: "internal-signal",
    source_reference: "host://signals/discovery-front-door",
    mission_alignment:
      "Improve Discovery as the operational front door with better queue coverage and routing discipline.",
    capability_gap_id: frontDoorGap?.gap_id ?? null,
    notes: "Front door coverage, intake queue discipline, routing hygiene, and monitor cadence.",
  };

  const architectureRequest: DiscoverySubmissionRequest = {
    candidate_id: "dw-routing-architecture-pattern",
    candidate_name: "Source Adaptation Routing Policy Pattern",
    source_type: "paper",
    source_reference: "https://example.com/source-adaptation-pattern",
    mission_alignment:
      "Improve routing quality, evaluator structure, and source adaptation logic for future candidates.",
    notes:
      "Extract schema, policy, evaluation, and workflow improvements into reusable operating code.",
  };

  const forgeRequest: DiscoverySubmissionRequest = {
    candidate_id: "dw-routing-forge-transform",
    candidate_name: "Runtime Transformation Candidate",
    source_type: "github-repo",
    source_reference: "https://example.com/runtime-transform",
    mission_alignment:
      "Improve runtime operationalization with a behavior-preserving transformation that lowers latency and cost.",
    notes:
      "Same capability, better implementation shape, faster runtime, lower cost, and stronger reliability.",
  };

  const discoveryAssessment = assessDiscoveryMissionRouting({
    request: discoveryRequest,
    gaps: missionRoutingGaps,
    activeMissionMarkdown,
    intakeQueueEntries: [],
  });
  const architectureAssessment = assessDiscoveryMissionRouting({
    request: architectureRequest,
    gaps: missionRoutingGaps,
    activeMissionMarkdown,
    intakeQueueEntries: [],
  });
  const forgeAssessment = assessDiscoveryMissionRouting({
    request: forgeRequest,
    gaps: missionRoutingGaps,
    activeMissionMarkdown,
    intakeQueueEntries: [],
  });

  try {
    assertCondition(
      discoveryAssessment.recommended_track === "discovery",
      "discovery candidate should route to discovery",
    );
    assertCondition(
      discoveryAssessment.matched_gap_id === "gap-discovery-front-door-coverage",
      "discovery candidate should match the open front-door gap",
    );
    assertCondition(
      architectureAssessment.recommended_track === "architecture",
      "architecture candidate should route to architecture",
    );
    assertCondition(
      forgeAssessment.recommended_track === "forge",
      "forge candidate should route to forge",
    );
    assertCondition(
      forgeAssessment.score_breakdown.transformation_signal >= 1,
      "forge candidate should register transformation signal",
    );
  } catch (error) {
    issues.push(String((error as Error).message || error));
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dw-routing-check-"));
  const tempDirectiveRoot = path.join(tempRoot, "directive-workspace");
  const queuePath = path.join(tempDirectiveRoot, "discovery", "intake-queue.json");
  const tempGapsPath = path.join(tempDirectiveRoot, "discovery", "capability-gaps.json");
  const tempMissionPath = path.join(tempDirectiveRoot, "knowledge", "active-mission.md");

  writeJson(queuePath, {
    status: "primary",
    updatedAt: "2026-03-22",
    entries: [],
  });
  writeJson(tempGapsPath, {
    ...gapsDocument,
    gaps: missionRoutingGaps,
  });
  fs.mkdirSync(path.dirname(tempMissionPath), { recursive: true });
  fs.writeFileSync(tempMissionPath, activeMissionMarkdown, "utf8");

  try {
    const dryRunResult = await submitDiscoveryEntry({
      request: discoveryRequest,
      directiveRoot: tempDirectiveRoot,
      queuePath,
      dryRun: true,
      receivedAt: "2026-03-22",
    }) as { assessment?: { recommended_track?: string; matched_gap_id?: string | null } };

    assertCondition(
      dryRunResult.assessment?.recommended_track === "discovery",
      "submission dry run should include discovery routing assessment",
    );
    assertCondition(
      dryRunResult.assessment?.matched_gap_id === "gap-discovery-front-door-coverage",
      "submission dry run should preserve matched front-door gap in the assessment",
    );
  } catch (error) {
    issues.push(String((error as Error).message || error));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const ok = issues.length === 0;
  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        assessments: {
          discovery: {
            track: discoveryAssessment.recommended_track,
            score: discoveryAssessment.mission_priority_score,
            matched_gap_id: discoveryAssessment.matched_gap_id,
          },
          architecture: {
            track: architectureAssessment.recommended_track,
            score: architectureAssessment.mission_priority_score,
          },
          forge: {
            track: forgeAssessment.recommended_track,
            score: forgeAssessment.mission_priority_score,
            transformation_signal: forgeAssessment.score_breakdown.transformation_signal,
          },
        },
        issues,
      },
      null,
      2,
    )}\n`,
  );

  if (!ok) {
    process.exit(1);
  }
}

void main();
