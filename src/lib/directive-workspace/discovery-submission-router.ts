// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-submission-router.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import type {
  DiscoveryIntakeSubmission,
  DiscoverySourceType,
} from "./discovery-intake-queue-writer";
import type { DiscoveryCaseIntakeSection, DiscoveryCaseTriageSection } from "./discovery-case-record-writer";
import type { DiscoveryCompletionRecordRequest } from "./discovery-completion-record-writer";
import type {
  DiscoveryFastPathRecordRequest,
} from "./discovery-fast-path-record-writer";
import type {
  DiscoveryRoutingDecisionState,
} from "./discovery-routing-record-writer";
import type { DiscoveryRoutingTarget } from "./discovery-intake-queue-writer";

export type DiscoverySubmissionShape = "queue_only" | "fast_path" | "split_case";

type DiscoveryCaseRoutingSection = {
  route_date: string;
  source_type: DiscoverySourceType;
  decision_state: DiscoveryRoutingDecisionState;
  adoption_target: string;
  route_destination: Exclude<DiscoveryRoutingTarget, null>;
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
  "candidate_id" | "candidate_name" | "linked_intake_record" | "linked_routing_record"
>;

export type DiscoverySubmissionRequest = DiscoveryIntakeSubmission & {
  record_shape?: DiscoverySubmissionShape | "auto" | null;
  fast_path?: Omit<
    DiscoveryFastPathRecordRequest,
    "candidate_id" | "candidate_name" | "source_type" | "source_reference"
  > | null;
  case_record?: {
    intake: Omit<
      DiscoveryCaseIntakeSection,
      "source_type" | "source_reference"
    > & { source_type?: DiscoverySourceType | null; source_reference?: string | null };
    triage: DiscoveryCaseTriageSection;
    routing: DiscoveryCaseRoutingSection;
    completion?: DiscoveryCaseCompletionSection | null;
  } | null;
};

function requiredString(value: string | null | undefined, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

export function determineDiscoverySubmissionShape(
  request: DiscoverySubmissionRequest,
): DiscoverySubmissionShape {
  const explicitShape = request.record_shape ?? "auto";

  if (explicitShape === "fast_path") {
    if (!request.fast_path) {
      throw new Error("fast_path payload is required when record_shape is fast_path");
    }
    return "fast_path";
  }

  if (explicitShape === "split_case") {
    if (!request.case_record) {
      throw new Error("case_record payload is required when record_shape is split_case");
    }
    return "split_case";
  }

  if (explicitShape === "queue_only") {
    return "queue_only";
  }

  if (request.case_record) {
    return "split_case";
  }
  if (request.fast_path) {
    return "fast_path";
  }
  return "queue_only";
}

export function toDiscoveryIntakeSubmission(
  request: DiscoverySubmissionRequest,
): DiscoveryIntakeSubmission {
  return {
    candidate_id: requiredString(request.candidate_id, "candidate_id"),
    candidate_name: requiredString(request.candidate_name, "candidate_name"),
    source_type: request.source_type ?? "internal-signal",
    source_reference: requiredString(request.source_reference, "source_reference"),
    mission_alignment: request.mission_alignment ?? null,
    capability_gap_id: request.capability_gap_id ?? null,
    notes: request.notes ?? null,
  };
}
