import fs from "node:fs";
import path from "node:path";
import {
  renderDiscoveryCompletionRecord,
  resolveDiscoveryCompletionRecordAbsolutePath,
  type DiscoveryCompletionRecordRequest,
} from "../src/lib/directive-workspace/discovery-completion-record-writer";
import {
  renderDiscoveryIntakeRecord,
  renderDiscoveryTriageRecord,
  resolveDiscoveryIntakeRecordPath,
  resolveDiscoveryTriageRecordPath,
  type DiscoveryCaseIntakeSection,
  type DiscoveryCaseTriageSection,
} from "../src/lib/directive-workspace/discovery-case-record-writer";
import {
  type DiscoveryIntakeLifecycleSyncRequest,
  syncDiscoveryIntakeLifecycle,
} from "../src/lib/directive-workspace/discovery-intake-lifecycle-sync";
import type {
  DiscoveryIntakeQueueDocument,
  DiscoverySourceType,
} from "../src/lib/directive-workspace/discovery-intake-queue-writer";
import {
  renderDiscoveryRoutingRecord,
  resolveDiscoveryRoutingRecordAbsolutePath,
  resolveDiscoveryRoutingRecordPath,
  type DiscoveryRoutingDecisionState,
  type DiscoveryRoutingRecordRequest,
} from "../src/lib/directive-workspace/discovery-routing-record-writer";

type DiscoveryCaseRoutingSection = {
  route_date: string;
  source_type: DiscoverySourceType;
  decision_state: DiscoveryRoutingDecisionState;
  adoption_target: string;
  route_destination: Exclude<
    DiscoveryRoutingRecordRequest["route_destination"],
    null
  >;
  why_this_route: string;
  why_not_alternatives: string;
  receiving_track_owner: string;
  required_next_artifact: string;
  handoff_contract_used?: string | null;
  reentry_or_promotion_conditions?: string | null;
  review_cadence?: string | null;
  output_relative_path?: string | null;
};

type DiscoveryCaseCompletionSection = Omit<
  DiscoveryCompletionRecordRequest,
  | "candidate_id"
  | "candidate_name"
  | "linked_intake_record"
  | "linked_routing_record"
>;

type DiscoveryCaseRecordRequest = {
  candidate_id: string;
  candidate_name: string;
  intake: DiscoveryCaseIntakeSection;
  triage: DiscoveryCaseTriageSection;
  routing: DiscoveryCaseRoutingSection;
  completion?: DiscoveryCaseCompletionSection | null;
};

function writeUtf8(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJsonNoBom(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv: string[]) {
  const args = {
    inputJsonPath: "",
    queuePath: "",
    directiveRoot: "",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-json-path") {
      args.inputJsonPath = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (token === "--queue-path") {
      args.queuePath = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (token === "--directive-root") {
      args.directiveRoot = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  if (!args.inputJsonPath) {
    throw new Error("Missing required argument: --input-json-path");
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const directiveRoot =
    args.directiveRoot || path.resolve(process.cwd(), "..", "directive-workspace");
  const queuePath =
    args.queuePath || path.join(directiveRoot, "discovery", "intake-queue.json");

  if (!fs.existsSync(args.inputJsonPath)) {
    throw new Error(`Input payload not found: ${args.inputJsonPath}`);
  }
  if (!fs.existsSync(queuePath)) {
    throw new Error(`Discovery queue not found: ${queuePath}`);
  }

  const request = JSON.parse(
    fs.readFileSync(args.inputJsonPath, "utf8"),
  ) as DiscoveryCaseRecordRequest;
  const queue = JSON.parse(
    fs.readFileSync(queuePath, "utf8"),
  ) as DiscoveryIntakeQueueDocument;

  const intakeRecordPath = resolveDiscoveryIntakeRecordPath({
    candidate_id: request.candidate_id,
    intake_date: request.intake.intake_date,
    output_relative_path: request.intake.output_relative_path,
  });
  const triageRecordPath = resolveDiscoveryTriageRecordPath({
    candidate_id: request.candidate_id,
    triage_date: request.triage.triage_date,
    output_relative_path: request.triage.output_relative_path,
  });
  const routingRequest: DiscoveryRoutingRecordRequest = {
    candidate_id: request.candidate_id,
    candidate_name: request.candidate_name,
    route_date: request.routing.route_date,
    source_type: request.routing.source_type,
    decision_state: request.routing.decision_state,
    adoption_target: request.routing.adoption_target,
    route_destination: request.routing.route_destination,
    why_this_route: request.routing.why_this_route,
    why_not_alternatives: request.routing.why_not_alternatives,
    receiving_track_owner: request.routing.receiving_track_owner,
    required_next_artifact: request.routing.required_next_artifact,
    linked_intake_record: intakeRecordPath,
    linked_triage_record: triageRecordPath,
    handoff_contract_used: request.routing.handoff_contract_used,
    reentry_or_promotion_conditions:
      request.routing.reentry_or_promotion_conditions,
    review_cadence: request.routing.review_cadence,
    output_relative_path: request.routing.output_relative_path,
  };
  const routingRecordPath = resolveDiscoveryRoutingRecordPath(routingRequest);

  const intakeMarkdown = renderDiscoveryIntakeRecord({
    candidate_id: request.candidate_id,
    candidate_name: request.candidate_name,
    intake: request.intake,
    linked_triage_record: triageRecordPath,
  });
  const triageMarkdown = renderDiscoveryTriageRecord({
    candidate_id: request.candidate_id,
    candidate_name: request.candidate_name,
    triage: request.triage,
    linked_intake_record: intakeRecordPath,
  });
  const routingMarkdown = renderDiscoveryRoutingRecord(routingRequest);

  const completionRequest = request.completion
    ? ({
        candidate_id: request.candidate_id,
        candidate_name: request.candidate_name,
        decision_date: request.completion.decision_date,
        decision_state: request.completion.decision_state,
        adoption_target: request.completion.adoption_target,
        route_destination: request.completion.route_destination,
        rationale: request.completion.rationale,
        evidence_path: request.completion.evidence_path,
        validation_method: request.completion.validation_method,
        rollback_note: request.completion.rollback_note,
        linked_intake_record: intakeRecordPath,
        linked_routing_record: routingRecordPath,
        output_relative_path: request.completion.output_relative_path,
        excluded_baggage: request.completion.excluded_baggage,
        risk_note: request.completion.risk_note,
        follow_up_owner: request.completion.follow_up_owner,
        follow_up_path: request.completion.follow_up_path,
      } satisfies DiscoveryCompletionRecordRequest)
    : null;
  const completionMarkdown = completionRequest
    ? renderDiscoveryCompletionRecord(completionRequest)
    : null;

  if (args.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          mode: "dry_run",
          queuePath,
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
        },
        null,
        2,
      )}\n`,
    );
    return;
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
    candidate_id: request.candidate_id,
    target_phase: completionRequest ? "completed" : "routed",
    routing_target: request.routing.route_destination,
    intake_record_path: intakeRecordPath,
    routing_record_path: routingRecordPath,
    result_record_path: completionRequest?.output_relative_path ?? null,
    note_append: completionRequest
      ? `discovery case records created: ${intakeRecordPath}, ${triageRecordPath}, ${routingRecordPath}, ${completionRequest.output_relative_path}`
      : `discovery case records created: ${intakeRecordPath}, ${triageRecordPath}, ${routingRecordPath}`,
  };

  const result = syncDiscoveryIntakeLifecycle({
    queue,
    request: lifecycleRequest,
    transitionDate: completionRequest
      ? completionRequest.decision_date
      : request.routing.route_date,
    directiveRoot,
  });

  writeJsonNoBom(queuePath, result.queue);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: "written",
        queuePath,
        candidate_id: result.entry.candidate_id,
        status: result.entry.status,
        appliedStages: result.appliedStages,
        createdPaths: {
          intakeRecordPath,
          triageRecordPath,
          routingRecordPath,
          completionRecordPath: completionRequest?.output_relative_path ?? null,
        },
      },
      null,
      2,
    )}\n`,
  );
}

main();
