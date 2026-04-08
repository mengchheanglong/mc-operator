import fs from "node:fs";
import path from "node:path";
import {
  appendDiscoveryIntakeQueueEntry,
  type DiscoveryIntakeQueueDocument,
} from "@/lib/directive-workspace/discovery-intake-queue-writer";
import {
  determineDiscoverySubmissionShape,
  toDiscoveryIntakeSubmission,
  type DiscoverySubmissionRequest,
} from "@/lib/directive-workspace/discovery-submission-router";
import {
  renderDiscoveryFastPathRecord,
  resolveDiscoveryFastPathRecordPath,
  type DiscoveryFastPathRecordRequest,
} from "@/lib/directive-workspace/discovery-fast-path-record-writer";
import {
  transitionDiscoveryIntakeQueueEntry,
  type DiscoveryIntakeTransitionRequest,
} from "@/lib/directive-workspace/discovery-intake-queue-transition";
import {
  renderDiscoveryIntakeRecord,
  renderDiscoveryTriageRecord,
  resolveDiscoveryIntakeRecordPath,
  resolveDiscoveryTriageRecordPath,
} from "@/lib/directive-workspace/discovery-case-record-writer";
import {
  renderDiscoveryRoutingRecord,
  resolveDiscoveryRoutingRecordAbsolutePath,
  resolveDiscoveryRoutingRecordPath,
  type DiscoveryRoutingRecordRequest,
} from "@/lib/directive-workspace/discovery-routing-record-writer";
import {
  renderDiscoveryCompletionRecord,
  resolveDiscoveryCompletionRecordAbsolutePath,
  type DiscoveryCompletionRecordRequest,
} from "@/lib/directive-workspace/discovery-completion-record-writer";
import {
  syncDiscoveryIntakeLifecycle,
  type DiscoveryIntakeLifecycleSyncRequest,
} from "@/lib/directive-workspace/discovery-intake-lifecycle-sync";
import { assessDiscoveryMissionRouting } from "@/lib/directive-workspace/discovery-mission-routing";
import {
  renderForgeFollowUpRecord,
  resolveForgeFollowUpRecordPath,
  type ForgeFollowUpRecordRequest,
} from "@/lib/directive-workspace/forge-follow-up-record-writer";
import { resolveDirectiveQueuePath, resolveDirectiveWorkspaceRoot } from "@/server/paths/directive-workspace-root";
import { processDirectiveEngineSource } from "@/server/services/directive-engine-product-boundary";
import type {
  CapabilityGapRecord,
  DiscoveryQueueEntry,
} from "@/lib/directive-workspace/discovery-gap-worklist-generator";

type DirectiveEngineCapabilityGap = any;
type DirectiveEngineMissionInput = any;
type DirectiveEngineRunRecord = any;
type DirectiveEngineSourceItem = any;

function writeUtf8(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJsonNoBom(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadQueue(queuePath: string) {
  return JSON.parse(fs.readFileSync(queuePath, "utf8")) as DiscoveryIntakeQueueDocument;
}

function loadUnresolvedGapIds(directiveRoot: string) {
  const gapsPath = path.join(directiveRoot, "discovery", "capability-gaps.json");
  const gaps = JSON.parse(fs.readFileSync(gapsPath, "utf8")) as {
    gaps?: Array<{ gap_id: string; resolved_at?: string | null }>;
  };
  return (gaps.gaps || [])
    .filter((gap) => !gap.resolved_at)
    .map((gap) => gap.gap_id);
}

function loadCapabilityGaps(directiveRoot: string) {
  const gapsPath = path.join(directiveRoot, "discovery", "capability-gaps.json");
  const gaps = JSON.parse(fs.readFileSync(gapsPath, "utf8")) as {
    gaps?: CapabilityGapRecord[];
  };
  return gaps.gaps || [];
}

function loadActiveMissionMarkdown(directiveRoot: string) {
  return fs.readFileSync(
    path.join(directiveRoot, "knowledge", "active-mission.md"),
    "utf8",
  );
}

function normalizeAbsolutePath(filePath: string) {
  return path.resolve(filePath).replace(/\\/g, "/");
}

function normalizeRelativeDirectivePath(
  directiveRoot: string,
  filePath: string,
) {
  return path.relative(directiveRoot, filePath).replace(/\\/g, "/");
}

function sanitizePathSegment(value: string) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeReceivedAt(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return new Date().toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T00:00:00.000Z`;
  }
  return normalized;
}

function buildDirectiveEngineSourceFromDiscoverySubmission(
  request: DiscoverySubmissionRequest,
): DirectiveEngineSourceItem {
  const notes = [
    typeof request.notes === "string" ? request.notes : null,
    request.record_shape ? `record_shape:${request.record_shape}` : null,
  ].filter((value): value is string => Boolean(value && value.trim()));
  const summary =
    request.mission_alignment?.trim()
    || "Mission Control Discovery submission routed through the Directive Engine.";

  return {
    sourceId: request.candidate_id,
    sourceType: request.source_type ?? "internal-signal",
    sourceRef: request.source_reference,
    title: request.candidate_name,
    summary,
    notes,
    missionAlignmentHint: request.mission_alignment ?? null,
    capabilityGapId: request.capability_gap_id ?? null,
  };
}

function buildDirectiveEngineMissionFromDiscoverySubmission(
  activeMissionMarkdown: string,
): DirectiveEngineMissionInput {
  return {
    missionId: "mission-control-discovery-submission",
    activeMissionMarkdown,
  };
}

function buildDirectiveEngineCapabilityGaps(
  gaps: CapabilityGapRecord[],
): DirectiveEngineCapabilityGap[] {
  return gaps
    .filter((gap) => !gap.resolved_at)
    .map((gap) => ({
      gapId: gap.gap_id,
      description: gap.description,
      priority: gap.priority,
      relatedMissionObjective: gap.related_mission_objective,
      currentState: gap.current_state,
      desiredState: gap.desired_state,
      detectedAt: gap.detected_at,
      resolvedAt: gap.resolved_at ?? null,
      resolutionNotes: gap.resolution_notes ?? null,
    }));
}

function resolveMissionControlEngineArtifactPaths(input: {
  directiveRoot: string;
  record: DirectiveEngineRunRecord;
}) {
  const artifactDir = normalizeAbsolutePath(
    path.join(input.directiveRoot, "runtime", "standalone-host", "engine-runs"),
  );
  const timestamp = input.record.receivedAt.replace(/[:.]/g, "-");
  const candidateSegment =
    sanitizePathSegment(input.record.candidate.candidateId)
    || sanitizePathSegment(input.record.runId)
    || "directive-engine-run";
  const runSegment = input.record.runId.slice(0, 8).toLowerCase();
  const baseName = `${timestamp}-${candidateSegment}-${runSegment}`;
  const recordPath = normalizeAbsolutePath(path.join(artifactDir, `${baseName}.json`));
  const reportPath = normalizeAbsolutePath(path.join(artifactDir, `${baseName}.md`));

  return {
    recordPath,
    reportPath,
    recordRelativePath: normalizeRelativeDirectivePath(input.directiveRoot, recordPath),
    reportRelativePath: normalizeRelativeDirectivePath(input.directiveRoot, reportPath),
  };
}

function renderMissionControlEngineRunReport(input: {
  record: DirectiveEngineRunRecord;
  artifactPaths: {
    recordRelativePath: string;
  };
}) {
  const { record } = input;

  return [
    "# Directive Engine Run",
    "",
    `- Run ID: \`${record.runId}\``,
    `- Received At: \`${record.receivedAt}\``,
    `- Candidate ID: \`${record.candidate.candidateId}\``,
    `- Candidate Name: ${record.candidate.candidateName}`,
    `- Source Type: \`${record.source.sourceType}\``,
    `- Source Ref: \`${record.source.sourceRef}\``,
    `- Selected Lane: \`${record.selectedLane.laneId}\``,
    `- Usefulness Level: \`${record.candidate.usefulnessLevel}\``,
    `- Decision State: \`${record.decision.decisionState}\``,
    `- Integration Mode: \`${record.integrationProposal.integrationMode}\``,
    `- Proof Kind: \`${record.proofPlan.proofKind}\``,
    `- Run Record Path: \`${input.artifactPaths.recordRelativePath}\``,
    "",
    "## Mission Fit",
    "",
    record.analysis.missionFitSummary,
    "",
    "## Usefulness Rationale",
    "",
    record.analysis.usefulnessRationale,
    "",
    "## Report Summary",
    "",
    record.reportPlan.summary,
    "",
    "## Routing Rationale",
    "",
    ...record.candidate.rationale.map((entry) => `- ${entry}`),
    "",
    "## Next Action",
    "",
    record.integrationProposal.nextAction,
    "",
  ].join("\n");
}

type MissionControlEngineHandoffMaterialization = {
  status: string;
  appliedStages: string[];
  createdPaths: {
    intakeRecordPath: string;
    triageRecordPath: string;
    routingRecordPath: string;
    handoffRecordPath: string;
  };
  queueEntry: DiscoveryQueueEntry;
};

function resolveEngineMaterializedRouteDate(record: DirectiveEngineRunRecord) {
  return record.receivedAt.slice(0, 10);
}

function resolveEngineRouteDestination(
  record: DirectiveEngineRunRecord,
): "architecture" | "forge" | null {
  switch (record.decision.decisionState) {
    case "accept_for_architecture":
      return "architecture";
    case "route_to_forge_follow_up":
      return "forge";
    default:
      return null;
  }
}

function resolveEngineAdoptionTarget(
  routeDestination: "architecture" | "forge",
  record: DirectiveEngineRunRecord,
) {
  if (routeDestination === "architecture") {
    return "engine-owned product logic";
  }
  if (record.routingAssessment.scoreBreakdown.transformationSignal > 0) {
    return "reusable runtime transformation capability";
  }
  return "reusable runtime capability";
}

function renderMissionControlArchitectureExperimentStub(input: {
  record: DirectiveEngineRunRecord;
  routeDate: string;
  routingRecordPath: string;
  artifactPaths: {
    recordRelativePath: string;
    reportRelativePath: string;
  };
}) {
  const record = input.record;
  const extractedValue = record.extractionPlan.extractedValue.length > 0
    ? record.extractionPlan.extractedValue.map((value) => `  - ${value}`).join("\n")
    : "  - n/a";
  const requiredGates = record.proofPlan.requiredGates.length > 0
    ? record.proofPlan.requiredGates.map((gate) => `  - \`${gate}\``).join("\n")
    : "  - n/a";

  return [
    `# ${record.candidate.candidateName} Engine-Routed Architecture Experiment`,
    "",
    `Date: ${input.routeDate}`,
    "Track: Architecture",
    "Type: engine-routed handoff",
    "Status: pending_review",
    "",
    "## Source",
    "",
    `- Candidate id: \`${record.candidate.candidateId}\``,
    `- Source reference: \`${record.source.sourceRef}\``,
    `- Engine run record: \`${input.artifactPaths.recordRelativePath}\``,
    `- Engine run report: \`${input.artifactPaths.reportRelativePath}\``,
    `- Discovery routing record: \`${input.routingRecordPath}\``,
    `- Usefulness level: \`${record.candidate.usefulnessLevel}\``,
    `- Usefulness rationale: ${record.analysis.usefulnessRationale}`,
    "",
    "## Objective",
    "",
    record.integrationProposal.nextAction,
    "",
    "## Bounded scope",
    "",
    "- Keep this at one Architecture experiment slice.",
    "- Preserve human review before any adoption or host integration.",
    "- Do not execute downstream Engine changes from this stub alone.",
    "",
    "## Inputs",
    "",
    extractedValue,
    "",
    "## Validation gate(s)",
    "",
    requiredGates,
    "",
    "## Lifecycle classification",
    "",
    "- Origin: `source-driven`",
    `- Usefulness level: \`${record.candidate.usefulnessLevel}\``,
    `- Forge threshold check: Would this mechanism still be valuable without a runtime surface? \`${record.integrationProposal.valuableWithoutHostRuntime ? "yes" : "no"}\``,
    "",
    "## Rollback",
    "",
    record.proofPlan.rollbackPrompt,
    "",
    "## Next decision",
    "",
    "- `needs-more-evidence`",
    "",
  ].join("\n");
}

function resolveMissionControlArchitectureExperimentPath(input: {
  candidateId: string;
  routeDate: string;
}) {
  return path
    .join(
      "architecture",
      "02-experiments",
      `${input.routeDate}-${input.candidateId}-engine-handoff.md`,
    )
    .replace(/\\/g, "/");
}

function materializeMissionControlEngineLaneHandoff(input: {
  directiveRoot: string;
  queuePath: string;
  request: DiscoverySubmissionRequest;
  record: DirectiveEngineRunRecord;
  artifactPaths: {
    recordRelativePath: string;
    reportRelativePath: string;
  };
}): MissionControlEngineHandoffMaterialization | null {
  const routeDestination = resolveEngineRouteDestination(input.record);
  if (!routeDestination) {
    return null;
  }

  const routeDate = resolveEngineMaterializedRouteDate(input.record);
  const intakeRecordPath = resolveDiscoveryIntakeRecordPath({
    candidate_id: input.request.candidate_id,
    intake_date: routeDate,
  });
  const triageRecordPath = resolveDiscoveryTriageRecordPath({
    candidate_id: input.request.candidate_id,
    triage_date: routeDate,
  });

  const adoptionTarget = resolveEngineAdoptionTarget(routeDestination, input.record);
  const intakeMarkdown = renderDiscoveryIntakeRecord({
    candidate_id: input.request.candidate_id,
    candidate_name: input.request.candidate_name,
    intake: {
      intake_date: routeDate,
      source_type: input.request.source_type ?? "internal-signal",
      source_reference: input.request.source_reference,
      submitted_by: "mission-control-discovery-engine",
      why_it_entered_the_system:
        `Engine processing produced a preliminary ${routeDestination} decision and needs a bounded downstream handoff artifact.`,
      claimed_value:
        input.record.extractionPlan.extractedValue[0]
        ?? input.record.analysis.missionFitSummary,
      initial_relevance_to_workspace: input.record.analysis.usefulnessRationale,
      suspected_adoption_target: adoptionTarget,
      immediate_notes:
        `Engine run ${input.record.runId} produced ${input.record.decision.decisionState}; human approval remains required.`,
    },
    linked_triage_record: triageRecordPath,
  });

  const triageMarkdown = renderDiscoveryTriageRecord({
    candidate_id: input.request.candidate_id,
    candidate_name: input.request.candidate_name,
    triage: {
      triage_date: routeDate,
      first_pass_summary: input.record.analysis.missionFitSummary,
      problem_it_appears_to_solve:
        input.record.improvementPlan.intendedDelta,
      extractable_value_hypothesis:
        input.record.extractionPlan.extractedValue.join(" | ")
        || input.record.analysis.missionFitSummary,
      routing_recommendation:
        `Engine selected ${routeDestination} with usefulness level ${input.record.candidate.usefulnessLevel}.`,
      proposed_adoption_target: adoptionTarget,
      stack_shape_summary:
        `${input.record.source.sourceType} source; host dependence ${input.record.integrationProposal.hostDependence}; integration mode ${input.record.integrationProposal.integrationMode}.`,
      boilerplate_vs_product_boundary:
        `Directive-owned form: ${input.record.adaptationPlan.directiveOwnedForm}. Excluded baggage: ${input.record.extractionPlan.excludedBaggage.join(", ") || "n/a"}.`,
      suggested_decision_state: input.record.decision.decisionState,
      fit_to_current_direction: input.record.analysis.usefulnessRationale,
      reusability_across_surfaces:
        input.record.integrationProposal.valuableWithoutHostRuntime
          ? "Value remains useful without a host runtime surface."
          : "Value depends on a host adapter boundary for repeated runtime use.",
      operational_risk: "Human review is still required before downstream execution or adoption.",
      integration_cost:
        input.record.integrationProposal.hostDependence === "host_adapter_required"
          ? "medium"
          : "low",
      can_current_gates_validate_safely:
        `partially - proof plan ${input.record.proofPlan.proofKind} already defines required evidence and gates.`,
      immediate_risks: input.record.proofPlan.requiredGates.join(", ") || "n/a",
      missing_evidence: input.record.proofPlan.requiredEvidence.join(", ") || "n/a",
      next_action: input.record.integrationProposal.nextAction,
      monitor_defer_trigger_conditions:
        "If the route is rejected in human review, return the candidate to Discovery holding state.",
      reentry_conditions:
        "Complete the planned proof and human review before any downstream execution.",
    },
    linked_intake_record: intakeRecordPath,
  });

  const handoffRecordPath = routeDestination === "forge"
    ? resolveForgeFollowUpRecordPath({
        candidate_id: input.request.candidate_id,
        follow_up_date: routeDate,
      })
    : resolveMissionControlArchitectureExperimentPath({
        candidateId: input.request.candidate_id,
        routeDate,
      });

  const routingRecordRequest: DiscoveryRoutingRecordRequest = {
    candidate_id: input.request.candidate_id,
    candidate_name: input.request.candidate_name,
    route_date: routeDate,
    source_type: input.request.source_type ?? "internal-signal",
    decision_state: "adopt",
    adoption_target: adoptionTarget,
    route_destination: routeDestination,
    why_this_route:
      input.record.routingAssessment.rationale[1]
      ?? `Engine selected ${routeDestination} for this candidate.`,
    why_not_alternatives:
      input.record.routingAssessment.rationale.filter((_, index) => index !== 1).join(" ")
      || "The other lanes scored lower under the current mission-conditioned routing pass.",
    receiving_track_owner: routeDestination,
    required_next_artifact: handoffRecordPath,
    linked_intake_record: intakeRecordPath,
    linked_triage_record: triageRecordPath,
    reentry_or_promotion_conditions:
      input.record.proofPlan.requiredGates.join(", ") || "human review required",
    review_cadence: "before any downstream execution or promotion",
  };
  const routingRecordPath = resolveDiscoveryRoutingRecordPath(routingRecordRequest);
  const routingMarkdown = renderDiscoveryRoutingRecord(routingRecordRequest);

  const handoffMarkdown = routeDestination === "forge"
    ? renderForgeFollowUpRecord({
        candidate_id: input.request.candidate_id,
        candidate_name: input.request.candidate_name,
        follow_up_date: routeDate,
        current_decision_state: input.record.decision.decisionState,
        origin_track: "discovery",
        runtime_value_to_operationalize:
          input.record.extractionPlan.extractedValue[0]
          ?? input.record.analysis.missionFitSummary,
        proposed_host: "mission-control",
        proposed_integration_mode: input.record.integrationProposal.integrationMode,
        allowed_export_surfaces: [
          "directive-engine run artifacts",
          "mission-control host adapter boundary",
        ],
        excluded_baggage: input.record.extractionPlan.excludedBaggage,
        required_proof: input.record.proofPlan.requiredEvidence,
        required_gates: input.record.proofPlan.requiredGates,
        trial_scope_limit: [
          "keep human review before any Forge execution",
          "do not create execution or promotion records from this stub alone",
        ],
        risks: [
          "human review still required before downstream Forge work",
          "host integration remains bounded behind the adapter boundary",
        ],
        rollback: input.record.proofPlan.rollbackPrompt,
        no_op_path:
          "Leave the candidate routed with a follow-up stub only and do not materialize runtime execution yet.",
        review_cadence: "before any Forge execution or promotion",
        current_status: "pending_review",
        linked_handoff_path: routingRecordPath,
      } satisfies ForgeFollowUpRecordRequest)
    : renderMissionControlArchitectureExperimentStub({
        record: input.record,
        routeDate,
        routingRecordPath,
        artifactPaths: input.artifactPaths,
      });

  writeUtf8(path.resolve(input.directiveRoot, intakeRecordPath), intakeMarkdown);
  writeUtf8(path.resolve(input.directiveRoot, triageRecordPath), triageMarkdown);
  writeUtf8(
    resolveDiscoveryRoutingRecordAbsolutePath({
      directiveRoot: input.directiveRoot,
      relativePath: routingRecordPath,
    }),
    routingMarkdown,
  );
  writeUtf8(path.resolve(input.directiveRoot, handoffRecordPath), handoffMarkdown);

  const queue = loadQueue(input.queuePath);
  const lifecycleResult = syncDiscoveryIntakeLifecycle({
    queue,
    request: {
      candidate_id: input.request.candidate_id,
      target_phase: "routed",
      routing_target: routeDestination,
      intake_record_path: intakeRecordPath,
      routing_record_path: routingRecordPath,
      result_record_path: handoffRecordPath,
      note_append:
        `engine handoff materialized: ${routingRecordPath} -> ${handoffRecordPath}`,
    } satisfies DiscoveryIntakeLifecycleSyncRequest,
    transitionDate: routeDate,
    directiveRoot: input.directiveRoot,
  });

  writeJsonNoBom(input.queuePath, lifecycleResult.queue);

  return {
    status: lifecycleResult.entry.status,
    appliedStages: lifecycleResult.appliedStages,
    createdPaths: {
      intakeRecordPath,
      triageRecordPath,
      routingRecordPath,
      handoffRecordPath,
    },
    queueEntry: lifecycleResult.entry,
  };
}

async function maybeAttachEngineResult(input: {
  result: { ok: true } & Record<string, unknown>;
  enabled: boolean | undefined;
  dryRun: boolean | undefined;
  directiveRoot: string;
  queuePath: string;
  request: DiscoverySubmissionRequest;
  receivedAt: string;
  activeMissionMarkdown: string;
  capabilityGaps: CapabilityGapRecord[];
  materializeHandoff?: boolean;
}) {
  if (!input.enabled) {
    return input.result;
  }

  if (input.dryRun) {
    return {
      ...input.result,
      engine: {
        ok: true,
        processed: false,
        reason: "dry_run" as const,
      },
    };
  }

  try {
    const engineResult = await processDirectiveEngineSource({
      directiveRoot: input.directiveRoot,
      payload: {
        source: buildDirectiveEngineSourceFromDiscoverySubmission(input.request),
        mission: buildDirectiveEngineMissionFromDiscoverySubmission(
          input.activeMissionMarkdown,
        ),
        gaps: buildDirectiveEngineCapabilityGaps(input.capabilityGaps),
        receivedAt: normalizeReceivedAt(input.receivedAt),
      },
    });
    const artifactPaths = resolveMissionControlEngineArtifactPaths({
      directiveRoot: input.directiveRoot,
      record: engineResult.record,
    });

    writeJsonNoBom(artifactPaths.recordPath, engineResult.record);
    writeUtf8(
      artifactPaths.reportPath,
      renderMissionControlEngineRunReport({
        record: engineResult.record,
        artifactPaths,
      }),
    );
    const handoff =
      input.materializeHandoff === true
        ? materializeMissionControlEngineLaneHandoff({
            directiveRoot: input.directiveRoot,
            queuePath: input.queuePath,
            request: input.request,
            record: engineResult.record,
            artifactPaths,
          })
        : null;

    return {
      ...input.result,
      ...(handoff
        ? {
            status: handoff.status,
            appliedStages: handoff.appliedStages,
            createdPaths: {
              ...(typeof input.result.createdPaths === "object" && input.result.createdPaths
                ? input.result.createdPaths
                : {}),
              ...handoff.createdPaths,
            },
          }
        : {}),
      engine: {
        ok: true,
        processed: true,
        path: artifactPaths.recordPath,
        relativePath: artifactPaths.recordRelativePath,
        reportPath: artifactPaths.reportPath,
        reportRelativePath: artifactPaths.reportRelativePath,
        record: engineResult.record,
        adapterResults: engineResult.adapterResults,
        handoff: handoff
          ? {
              materialized: true,
              status: handoff.status,
              appliedStages: handoff.appliedStages,
              createdPaths: handoff.createdPaths,
            }
          : {
              materialized: false,
            },
      },
    };
  } catch (error) {
    return {
      ...input.result,
      engine: {
        ok: false,
        processed: false,
        error: String((error as Error).message || error),
      },
    };
  }
}

export type SubmitDiscoveryEntryOptions = {
  request: DiscoverySubmissionRequest;
  directiveRoot?: string;
  queuePath?: string;
  dryRun?: boolean;
  processWithEngine?: boolean;
  receivedAt?: string;
};

export async function submitDiscoveryEntry(input: SubmitDiscoveryEntryOptions) {
  const directiveRoot = resolveDirectiveWorkspaceRoot({
    directiveRoot: input.directiveRoot,
  });
  const queuePath = resolveDirectiveQueuePath({
    directiveRoot,
    queuePath: input.queuePath,
  });

  if (!fs.existsSync(queuePath)) {
    throw new Error(`Discovery queue not found: ${queuePath}`);
  }

  const queue = loadQueue(queuePath);
  const unresolvedGapIds = loadUnresolvedGapIds(directiveRoot);
  const capabilityGaps = loadCapabilityGaps(directiveRoot);
  const activeMissionMarkdown = loadActiveMissionMarkdown(directiveRoot);
  const receivedAt = input.receivedAt || new Date().toISOString().slice(0, 10);
  const assessment = assessDiscoveryMissionRouting({
    request: input.request,
    gaps: capabilityGaps,
    activeMissionMarkdown,
    intakeQueueEntries: queue.entries as DiscoveryQueueEntry[],
  });
  const queueAppend = appendDiscoveryIntakeQueueEntry({
    queue,
    submission: toDiscoveryIntakeSubmission(input.request),
    receivedAt,
    unresolvedGapIds,
  });
  const shape = determineDiscoverySubmissionShape(input.request);

  if (shape === "queue_only") {
    if (input.dryRun) {
      return maybeAttachEngineResult({
        result: {
        ok: true,
        mode: "dry_run" as const,
        record_shape: shape,
        queuePath,
        entry: queueAppend.entry,
        assessment,
        },
        enabled: input.processWithEngine,
        dryRun: input.dryRun,
        directiveRoot,
        queuePath,
        request: input.request,
        receivedAt,
        activeMissionMarkdown,
        capabilityGaps,
        materializeHandoff: true,
      });
    }

    writeJsonNoBom(queuePath, queueAppend.queue);
    return maybeAttachEngineResult({
      result: {
      ok: true,
      mode: "submitted" as const,
      record_shape: shape,
      queuePath,
      candidate_id: queueAppend.entry.candidate_id,
      status: queueAppend.entry.status,
      assessment,
      },
      enabled: input.processWithEngine,
      dryRun: input.dryRun,
      directiveRoot,
      queuePath,
      request: input.request,
      receivedAt,
      activeMissionMarkdown,
      capabilityGaps,
      materializeHandoff: true,
    });
  }

  if (shape === "fast_path") {
    const fastPath = input.request.fast_path!;
    const fastPathRequest: DiscoveryFastPathRecordRequest = {
      candidate_id: input.request.candidate_id,
      candidate_name: input.request.candidate_name,
      record_date: fastPath.record_date,
      source_type: input.request.source_type ?? "internal-signal",
      source_reference: input.request.source_reference,
      claimed_value: fastPath.claimed_value,
      first_pass_summary: fastPath.first_pass_summary,
      adoption_target: fastPath.adoption_target,
      decision_state: fastPath.decision_state,
      route_destination: fastPath.route_destination,
      why_this_route: fastPath.why_this_route,
      why_not_alternatives: fastPath.why_not_alternatives,
      need_bounded_proof: fastPath.need_bounded_proof,
      next_artifact: fastPath.next_artifact,
      source_location_on_disk: fastPath.source_location_on_disk,
      stack_language: fastPath.stack_language,
      stack_runtime: fastPath.stack_runtime,
      stack_framework: fastPath.stack_framework,
      stack_package_tool: fastPath.stack_package_tool,
      stack_deployment: fastPath.stack_deployment,
      stack_external_dependencies: fastPath.stack_external_dependencies,
      stack_data_model_assumptions: fastPath.stack_data_model_assumptions,
      stack_integration_shape: fastPath.stack_integration_shape,
      compaction_profile: fastPath.compaction_profile,
      compaction_status: fastPath.compaction_status,
      compaction_reason: fastPath.compaction_reason,
      reentry_trigger: fastPath.reentry_trigger,
      review_cadence: fastPath.review_cadence,
      mission_alignment: fastPath.mission_alignment ?? input.request.mission_alignment,
      capability_gap_id: fastPath.capability_gap_id ?? input.request.capability_gap_id,
      gap_worklist_rank: fastPath.gap_worklist_rank,
      output_relative_path: fastPath.output_relative_path,
    };
    const fastPathRecordPath = resolveDiscoveryFastPathRecordPath({
      candidate_id: fastPathRequest.candidate_id,
      record_date: fastPathRequest.record_date,
      output_relative_path: fastPathRequest.output_relative_path,
    });
    const fastPathMarkdown = renderDiscoveryFastPathRecord(fastPathRequest);

    if (input.dryRun) {
      return maybeAttachEngineResult({
        result: {
        ok: true,
        mode: "dry_run" as const,
        record_shape: shape,
        queuePath,
        entry: queueAppend.entry,
        computedPaths: { fastPathRecordPath },
        previews: { fastPathMarkdown },
        assessment,
        },
        enabled: input.processWithEngine,
        dryRun: input.dryRun,
        directiveRoot,
        queuePath,
        request: input.request,
        receivedAt,
        activeMissionMarkdown,
        capabilityGaps,
      });
    }

    writeUtf8(path.resolve(directiveRoot, fastPathRecordPath), fastPathMarkdown);
    const processingTransition = transitionDiscoveryIntakeQueueEntry({
      queue: queueAppend.queue,
      request: {
        candidate_id: input.request.candidate_id,
        target_status: "processing",
      } satisfies DiscoveryIntakeTransitionRequest,
      transitionDate: fastPath.record_date,
    });
    const routedTransition = transitionDiscoveryIntakeQueueEntry({
      queue: processingTransition.queue,
      request: {
        candidate_id: input.request.candidate_id,
        target_status: "routed",
        routing_target: fastPath.route_destination,
        fast_path_record_path: fastPathRecordPath,
        note_append: `fast-path record created: ${fastPathRecordPath}`,
      } satisfies DiscoveryIntakeTransitionRequest,
      transitionDate: fastPath.record_date,
    });

    writeJsonNoBom(queuePath, routedTransition.queue);
    return maybeAttachEngineResult({
      result: {
      ok: true,
      mode: "submitted" as const,
      record_shape: shape,
      queuePath,
      candidate_id: routedTransition.entry.candidate_id,
      status: routedTransition.entry.status,
      createdPaths: { fastPathRecordPath },
      assessment,
      },
      enabled: input.processWithEngine,
      dryRun: input.dryRun,
      directiveRoot,
      queuePath,
      request: input.request,
      receivedAt,
      activeMissionMarkdown,
      capabilityGaps,
    });
  }

  const caseRecord = input.request.case_record!;
  const intakeRecordPath = resolveDiscoveryIntakeRecordPath({
    candidate_id: input.request.candidate_id,
    intake_date: caseRecord.intake.intake_date,
    output_relative_path: caseRecord.intake.output_relative_path,
  });
  const triageRecordPath = resolveDiscoveryTriageRecordPath({
    candidate_id: input.request.candidate_id,
    triage_date: caseRecord.triage.triage_date,
    output_relative_path: caseRecord.triage.output_relative_path,
  });
  const intakeMarkdown = renderDiscoveryIntakeRecord({
    candidate_id: input.request.candidate_id,
    candidate_name: input.request.candidate_name,
    intake: {
      ...caseRecord.intake,
      source_type:
        caseRecord.intake.source_type ?? input.request.source_type ?? "internal-signal",
      source_reference:
        caseRecord.intake.source_reference ?? input.request.source_reference,
    },
    linked_triage_record: triageRecordPath,
  });
  const triageMarkdown = renderDiscoveryTriageRecord({
    candidate_id: input.request.candidate_id,
    candidate_name: input.request.candidate_name,
    triage: caseRecord.triage,
    linked_intake_record: intakeRecordPath,
  });
  const routingRequest: DiscoveryRoutingRecordRequest = {
    candidate_id: input.request.candidate_id,
    candidate_name: input.request.candidate_name,
    route_date: caseRecord.routing.route_date,
    source_type: caseRecord.routing.source_type,
    decision_state: caseRecord.routing.decision_state,
    adoption_target: caseRecord.routing.adoption_target,
    route_destination: caseRecord.routing.route_destination,
    why_this_route: caseRecord.routing.why_this_route,
    why_not_alternatives: caseRecord.routing.why_not_alternatives,
    receiving_track_owner: caseRecord.routing.receiving_track_owner,
    required_next_artifact: caseRecord.routing.required_next_artifact,
    linked_intake_record: intakeRecordPath,
    linked_triage_record: triageRecordPath,
    handoff_contract_used: caseRecord.routing.handoff_contract_used,
    reentry_or_promotion_conditions:
      caseRecord.routing.reentry_or_promotion_conditions,
    review_cadence: caseRecord.routing.review_cadence,
    output_relative_path: caseRecord.routing.output_relative_path,
  };
  const routingRecordPath = resolveDiscoveryRoutingRecordPath(routingRequest);
  const routingMarkdown = renderDiscoveryRoutingRecord(routingRequest);
  const completionRequest = caseRecord.completion
    ? ({
        candidate_id: input.request.candidate_id,
        candidate_name: input.request.candidate_name,
        decision_date: caseRecord.completion.decision_date,
        decision_state: caseRecord.completion.decision_state,
        adoption_target: caseRecord.completion.adoption_target,
        route_destination: caseRecord.completion.route_destination,
        rationale: caseRecord.completion.rationale,
        evidence_path: caseRecord.completion.evidence_path,
        validation_method: caseRecord.completion.validation_method,
        rollback_note: caseRecord.completion.rollback_note,
        linked_intake_record: intakeRecordPath,
        linked_routing_record: routingRecordPath,
        output_relative_path: caseRecord.completion.output_relative_path,
        excluded_baggage: caseRecord.completion.excluded_baggage,
        risk_note: caseRecord.completion.risk_note,
        follow_up_owner: caseRecord.completion.follow_up_owner,
        follow_up_path: caseRecord.completion.follow_up_path,
      } satisfies DiscoveryCompletionRecordRequest)
    : null;
  const completionMarkdown = completionRequest
    ? renderDiscoveryCompletionRecord(completionRequest)
    : null;

  if (input.dryRun) {
    return maybeAttachEngineResult({
      result: {
      ok: true,
      mode: "dry_run" as const,
      record_shape: shape,
      queuePath,
      entry: queueAppend.entry,
      computedPaths: {
        intakeRecordPath,
        triageRecordPath,
        routingRecordPath,
        completionRecordPath: completionRequest?.output_relative_path ?? null,
      },
      previews: {
        intakeMarkdown,
        triageMarkdown,
        routingMarkdown,
        completionMarkdown,
      },
      assessment,
      },
      enabled: input.processWithEngine,
      dryRun: input.dryRun,
      directiveRoot,
      queuePath,
      request: input.request,
      receivedAt,
      activeMissionMarkdown,
      capabilityGaps,
    });
  }

  writeUtf8(path.resolve(directiveRoot, intakeRecordPath), intakeMarkdown);
  writeUtf8(path.resolve(directiveRoot, triageRecordPath), triageMarkdown);
  writeUtf8(
    resolveDiscoveryRoutingRecordAbsolutePath({
      directiveRoot,
      relativePath: routingRecordPath,
    }),
    routingMarkdown,
  );
  if (completionRequest && completionMarkdown) {
    writeUtf8(
      resolveDiscoveryCompletionRecordAbsolutePath({
        directiveRoot,
        relativePath: completionRequest.output_relative_path,
      }),
      completionMarkdown,
    );
  }

  const lifecycleRequest: DiscoveryIntakeLifecycleSyncRequest = {
    candidate_id: input.request.candidate_id,
    target_phase: completionRequest ? "completed" : "routed",
    routing_target: caseRecord.routing.route_destination,
    intake_record_path: intakeRecordPath,
    routing_record_path: routingRecordPath,
    result_record_path: completionRequest?.output_relative_path ?? null,
    note_append: completionRequest
      ? `discovery case records created: ${intakeRecordPath}, ${triageRecordPath}, ${routingRecordPath}, ${completionRequest.output_relative_path}`
      : `discovery case records created: ${intakeRecordPath}, ${triageRecordPath}, ${routingRecordPath}`,
  };

  const lifecycleResult = syncDiscoveryIntakeLifecycle({
    queue: queueAppend.queue,
    request: lifecycleRequest,
    transitionDate: completionRequest
      ? completionRequest.decision_date
      : caseRecord.routing.route_date,
    directiveRoot,
  });

  writeJsonNoBom(queuePath, lifecycleResult.queue);
  return maybeAttachEngineResult({
    result: {
    ok: true,
    mode: "submitted" as const,
    record_shape: shape,
    queuePath,
    candidate_id: lifecycleResult.entry.candidate_id,
    status: lifecycleResult.entry.status,
    appliedStages: lifecycleResult.appliedStages,
    createdPaths: {
      intakeRecordPath,
      triageRecordPath,
      routingRecordPath,
      completionRecordPath: completionRequest?.output_relative_path ?? null,
    },
    assessment,
    },
    enabled: input.processWithEngine,
    dryRun: input.dryRun,
    directiveRoot,
    queuePath,
    request: input.request,
    receivedAt,
    activeMissionMarkdown,
    capabilityGaps,
  });
}
