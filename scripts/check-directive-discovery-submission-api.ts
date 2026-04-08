import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { POST } from "../src/app/api/directive-workspace/discovery/submissions/route";
import { readDirectiveEngineRunsOverview } from "../src/server/services/directive-engine-run-read-service";

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  const directiveRoot = path.join(root, "workspace", "directive-workspace");
  const routePath = path.join(
    process.cwd(),
    "src",
    "app",
    "api",
    "directive-workspace",
    "discovery",
    "submissions",
    "route.ts",
  );
  const issues: string[] = [];
  if (!fs.existsSync(routePath)) issues.push("missing discovery submission API route");

  if (issues.length > 0) {
    console.log(JSON.stringify({ ok: false, issues }, null, 2));
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-discovery-api-"));
  const tempDirectiveRoot = path.join(tempDir, "directive-workspace");
  const queuePath = path.join(tempDirectiveRoot, "discovery", "intake-queue.json");
  const gapsPath = path.join(tempDirectiveRoot, "discovery", "capability-gaps.json");
  const missionPath = path.join(tempDirectiveRoot, "knowledge", "active-mission.md");
  const canonicalMissionPath = path.join(
    directiveRoot,
    "knowledge",
    "active-mission.md",
  );

  writeJson(queuePath, {
    status: "primary",
    updatedAt: "2026-03-22",
    policy: { schemaRef: "shared/schemas/discovery-intake-queue-entry.schema.json" },
    entries: [],
  });
  writeJson(gapsPath, {
    gaps: [
      { gap_id: "gap-discovery-front-door-coverage", resolved_at: null },
      {
        gap_id: "gap-directive-engine-materialization",
        description:
          "Canonical Directive engine surface is only partially materialized as one reusable executable core with clear lane boundaries and host-adapter seams",
        priority: "high",
        related_mission_objective: "Directive engine materialization",
        current_state:
          "A first engine slice exists, but real source intake still falls back to host helpers, Markdown-first assets, and manual post-decision lane handoff",
        desired_state:
          "Engine owns substantially more intake, routing, adaptation/improvement, proof, decision, and handoff state while Discovery, Forge, and Architecture operate as clear Engine lanes",
        detected_at: "2026-03-24",
        resolved_at: null,
      },
    ],
  });
  fs.mkdirSync(path.dirname(missionPath), { recursive: true });
  fs.copyFileSync(canonicalMissionPath, missionPath);

  process.env.DIRECTIVE_WORKSPACE_ROOT_OVERRIDE = tempDirectiveRoot;
  process.env.DIRECTIVE_QUEUE_PATH_OVERRIDE = queuePath;

  const previewRequest = new Request(
    "http://localhost/api/directive-workspace/discovery/submissions?dry_run=1",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidate_id: "dryrun-discovery-submission-api",
        candidate_name: "Dry Run Discovery Submission API",
        source_reference: "mission-control/scripts/check-directive-discovery-submission-api.ts",
        source_type: "internal-signal",
        mission_alignment: "Discovery as front door",
        capability_gap_id: "gap-discovery-front-door-coverage",
        fast_path: {
          record_date: "2026-03-22",
          claimed_value: "Route-level host API for unified Discovery submission.",
          first_pass_summary: "Simple signal, should go through fast-path automatically.",
          adoption_target: "reusable internal operating logic",
          decision_state: "adopt",
          route_destination: "architecture",
          why_this_route: "This improves Discovery operating shape rather than runtime behavior.",
          why_not_alternatives: "Split-case is unnecessary for this dry run.",
          need_bounded_proof: "Route-level temp workspace validation.",
          next_artifact: "architecture/02-experiments/2026-03-22-dry-run-api-fast-path.md"
        }
      }),
    },
  );

  const previewResponse = await POST(previewRequest);
  const previewBody = await previewResponse.json();

  if (previewResponse.status !== 200) {
    issues.push(`Preview API response status was ${previewResponse.status}`);
  }
  if (previewBody?.ok !== true) {
    issues.push("Preview API response missing ok=true");
  }
  if (previewBody?.mode !== "dry_run") {
    issues.push("Preview API response did not stay in dry_run mode");
  }
  if (previewBody?.assessment?.recommended_track !== "discovery") {
    issues.push("Preview API response missing discovery routing assessment");
  }
  if (fs.existsSync(
    path.join(
      tempDirectiveRoot,
      "discovery",
      "intake",
      "2026-03-22-dryrun-discovery-submission-api-fast-path.md",
    ),
  )) {
    issues.push("Preview API request should not create fast-path record");
  }

  const previewQueue = JSON.parse(fs.readFileSync(queuePath, "utf8")) as {
    entries: Array<Record<string, unknown>>;
  };
  if (previewQueue.entries.length !== 0) {
    issues.push("Preview API request should not mutate the discovery queue");
  }

  const request = new Request(
    "http://localhost/api/directive-workspace/discovery/submissions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidate_id: "dryrun-discovery-submission-api",
        candidate_name: "Dry Run Discovery Submission API",
        source_reference: "mission-control/scripts/check-directive-discovery-submission-api.ts",
        source_type: "internal-signal",
        mission_alignment: "Discovery as front door",
        capability_gap_id: "gap-discovery-front-door-coverage",
        fast_path: {
          record_date: "2026-03-22",
          claimed_value: "Route-level host API for unified Discovery submission.",
          first_pass_summary: "Simple signal, should go through fast-path automatically.",
          adoption_target: "reusable internal operating logic",
          decision_state: "adopt",
          route_destination: "architecture",
          why_this_route: "This improves Discovery operating shape rather than runtime behavior.",
          why_not_alternatives: "Split-case is unnecessary for this dry run.",
          need_bounded_proof: "Route-level temp workspace validation.",
          next_artifact: "architecture/02-experiments/2026-03-22-dry-run-api-fast-path.md"
        }
      }),
    },
  );

  const response = await POST(request);
  const body = await response.json();

  const engineRequest = new Request(
    "http://localhost/api/directive-workspace/discovery/submissions?process_with_engine=1",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidate_id: "engine-architecture-submission-api",
        candidate_name: "Engine Architecture Submission API",
        source_reference: "https://github.com/assafelovic/gpt-researcher",
        source_type: "github-repo",
        mission_alignment:
          "Directive engine materialization, routing quality, adaptation quality, proof, and self-improvement. This should improve engine-owned product logic rather than become a runtime host feature.",
        notes:
          "mission-control producer path; engine-native persistence; engine handoff materialization; architecture lane pressure",
      }),
    },
  );

  const engineResponse = await POST(engineRequest);
  const engineBody = await engineResponse.json();

  delete process.env.DIRECTIVE_WORKSPACE_ROOT_OVERRIDE;
  delete process.env.DIRECTIVE_QUEUE_PATH_OVERRIDE;

  if (response.status !== 200) {
    issues.push(`API response status was ${response.status}`);
  }
  if (body?.ok !== true) {
    issues.push("API response missing ok=true");
  }
  if (body?.record_shape !== "fast_path") {
    issues.push("API response did not route to fast_path");
  }
  if (body?.assessment?.recommended_track !== "discovery") {
    issues.push("Submit API response missing discovery routing assessment");
  }
  if (engineResponse.status !== 200) {
    issues.push(`Engine API response status was ${engineResponse.status}`);
  }
  if (engineBody?.ok !== true) {
    issues.push("Engine API response missing ok=true");
  }
  if (engineBody?.record_shape !== "queue_only") {
    issues.push("Engine API response should preserve the queue_only submission shape");
  }
  if (engineBody?.engine?.ok !== true || engineBody?.engine?.processed !== true) {
    issues.push("Engine API response missing processed engine result");
  }
  if (
    typeof engineBody?.engine?.record?.analysis?.usefulnessRationale !== "string"
    || engineBody.engine.record.analysis.usefulnessRationale.trim().length === 0
  ) {
    issues.push("Engine API response missing analysis usefulness rationale");
  }
  if (
    typeof engineBody?.engine?.record?.reportPlan?.usefulnessRationale !== "string"
    || engineBody.engine.record.reportPlan.usefulnessRationale.trim().length === 0
  ) {
    issues.push("Engine API response missing report usefulness rationale");
  }
  if (engineBody?.engine?.record?.candidate?.matchedGapId !== "gap-directive-engine-materialization") {
    issues.push("Engine API response did not match the open engine-materialization gap");
  }
  if (engineBody?.engine?.record?.decision?.decisionState !== "accept_for_architecture") {
    issues.push("Engine API response did not produce an Architecture decision");
  }
  if (
    engineBody?.engine?.handoff?.materialized !== true
    || engineBody?.status !== "routed"
  ) {
    issues.push("Engine API response did not materialize and route the handoff");
  }
  const createdPaths = engineBody?.createdPaths ?? {};
  const intakeRecordPath = createdPaths.intakeRecordPath;
  const triageRecordPath = createdPaths.triageRecordPath;
  const routingRecordPath = createdPaths.routingRecordPath;
  const handoffRecordPath = createdPaths.handoffRecordPath;
  if (!intakeRecordPath || !fs.existsSync(path.join(tempDirectiveRoot, intakeRecordPath))) {
    issues.push("Engine submission did not create an intake record");
  }
  if (!triageRecordPath || !fs.existsSync(path.join(tempDirectiveRoot, triageRecordPath))) {
    issues.push("Engine submission did not create a triage record");
  }
  if (!routingRecordPath || !fs.existsSync(path.join(tempDirectiveRoot, routingRecordPath))) {
    issues.push("Engine submission did not create a routing record");
  }
  if (!handoffRecordPath || !fs.existsSync(path.join(tempDirectiveRoot, handoffRecordPath))) {
    issues.push("Engine submission did not create a downstream handoff stub");
  }

  const queue = JSON.parse(fs.readFileSync(queuePath, "utf8")) as {
    entries: Array<Record<string, unknown>>;
  };
  const entry = queue.entries[0];
  const fastPathFile = path.join(
    tempDirectiveRoot,
    "discovery",
    "intake",
    "2026-03-22-dryrun-discovery-submission-api-fast-path.md",
  );

  if (!fs.existsSync(fastPathFile)) {
    issues.push("API route did not create fast-path record");
  }
  if (!entry || entry.status !== "routed") {
    issues.push("API route did not move queue entry to routed");
  }

  const engineEntry = queue.entries.find(
    (queueEntry) => queueEntry.candidate_id === "engine-architecture-submission-api",
  );
  if (!engineEntry || engineEntry.status !== "routed") {
    issues.push("Engine submission should route the queue entry after handoff materialization");
  }
  if (engineEntry?.routing_target !== "architecture") {
    issues.push("Engine submission queue entry should target architecture");
  }
  if (engineEntry?.routing_record_path !== routingRecordPath) {
    issues.push("Engine submission queue entry missing routing_record_path");
  }
  if (engineEntry?.result_record_path !== handoffRecordPath) {
    issues.push("Engine submission queue entry missing handoff result_record_path");
  }

  const engineRecordPath = engineBody?.engine?.path;
  const engineReportPath = engineBody?.engine?.reportPath;
  if (!engineRecordPath || !fs.existsSync(engineRecordPath)) {
    issues.push("Engine submission did not persist a run record artifact");
  }
  if (!engineReportPath || !fs.existsSync(engineReportPath)) {
    issues.push("Engine submission did not persist a paired run report");
  }
  if (
    typeof engineBody?.engine?.relativePath !== "string"
    || !engineBody.engine.relativePath.includes("runtime/standalone-host/engine-runs/")
  ) {
    issues.push("Engine submission returned an unexpected run record relative path");
  }

  const overview = readDirectiveEngineRunsOverview({
    directiveRoot: tempDirectiveRoot,
    maxRuns: 3,
  });
  if (overview.ok !== true) {
    issues.push("Mission Control Engine-runs reader could not read produced artifacts");
  }
  if (overview.totalRuns !== 1) {
    issues.push(`Expected 1 produced Engine run artifact, found ${overview.totalRuns}`);
  }
  if (
    overview.recentRuns[0]?.record.candidate.candidateId
    !== "engine-architecture-submission-api"
  ) {
    issues.push("Engine-runs reader did not surface the produced candidate");
  }
  if (
    overview.recentRuns[0]?.record.analysis.usefulnessRationale
    !== engineBody?.engine?.record?.analysis?.usefulnessRationale
  ) {
    issues.push("Engine-runs reader should preserve the produced usefulness rationale");
  }

  fs.rmSync(tempDir, { recursive: true, force: true });

  const ok = issues.length === 0;
  console.log(
    JSON.stringify(
      {
        ok,
        metrics: {
          routeExists: true,
          engineProduced: engineBody?.engine?.processed === true,
          engineRunsRead: overview.ok === true ? overview.totalRuns : 0,
          failedChecks: issues.length,
        },
        issues,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(1);
}

void main();
