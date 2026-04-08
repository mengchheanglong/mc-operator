// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-routing-record-writer.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import path from "node:path";
import {
  type DiscoveryRoutingTarget,
  type DiscoverySourceType,
} from "./discovery-intake-queue-writer";

export type DiscoveryRoutingDecisionState =
  | "adopt"
  | "defer"
  | "monitor"
  | "reject";

export type DiscoveryRoutingRecordRequest = {
  candidate_id: string;
  candidate_name: string;
  route_date: string;
  source_type: DiscoverySourceType;
  decision_state: DiscoveryRoutingDecisionState;
  adoption_target: string;
  route_destination: Exclude<DiscoveryRoutingTarget, null>;
  why_this_route: string;
  why_not_alternatives: string;
  receiving_track_owner: string;
  required_next_artifact: string;
  linked_intake_record: string;
  handoff_contract_used?: string | null;
  linked_triage_record?: string | null;
  reentry_or_promotion_conditions?: string | null;
  review_cadence?: string | null;
  output_relative_path?: string | null;
};

function requiredString(value: string | null | undefined, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugifyCandidateId(candidateId: string) {
  return candidateId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function resolveDiscoveryRoutingRecordPath(
  request: DiscoveryRoutingRecordRequest,
) {
  const explicit = optionalString(request.output_relative_path);
  if (explicit) {
    return explicit.replace(/\\/g, "/");
  }
  return `discovery/routing-log/${request.route_date}-${slugifyCandidateId(
    request.candidate_id,
  )}-routing-record.md`;
}

export function renderDiscoveryRoutingRecord(
  request: DiscoveryRoutingRecordRequest,
) {
  const candidateId = requiredString(request.candidate_id, "candidate_id");
  const candidateName = requiredString(request.candidate_name, "candidate_name");
  const routeDate = requiredString(request.route_date, "route_date");
  const sourceType = requiredString(request.source_type, "source_type");
  const decisionState = requiredString(request.decision_state, "decision_state");
  const adoptionTarget = requiredString(request.adoption_target, "adoption_target");
  const routeDestination = requiredString(
    request.route_destination,
    "route_destination",
  );
  const whyThisRoute = requiredString(request.why_this_route, "why_this_route");
  const whyNotAlternatives = requiredString(
    request.why_not_alternatives,
    "why_not_alternatives",
  );
  const receivingTrackOwner = requiredString(
    request.receiving_track_owner,
    "receiving_track_owner",
  );
  const requiredNextArtifact = requiredString(
    request.required_next_artifact,
    "required_next_artifact",
  );
  const linkedIntakeRecord = requiredString(
    request.linked_intake_record,
    "linked_intake_record",
  );

  const handoffContractUsed = optionalString(request.handoff_contract_used);
  const linkedTriageRecord = optionalString(request.linked_triage_record);
  const reentryOrPromotionConditions = optionalString(
    request.reentry_or_promotion_conditions,
  );
  const reviewCadence = optionalString(request.review_cadence);

  return `# Discovery Routing Record: ${candidateName}

Date: ${routeDate}

- Candidate id: ${candidateId}
- Candidate name: ${candidateName}
- Routing date: ${routeDate}
- Source type: ${sourceType}
- Decision state: ${decisionState}
- Adoption target: ${adoptionTarget}
- Route destination: ${routeDestination}
- Why this route: ${whyThisRoute}
- Why not the alternatives: ${whyNotAlternatives}
- Handoff contract used: ${handoffContractUsed ?? "n/a"}
- Receiving track owner: ${receivingTrackOwner}
- Required next artifact: ${requiredNextArtifact}
- Re-entry/Promotion trigger conditions: ${reentryOrPromotionConditions ?? "n/a"}
- Review cadence: ${reviewCadence ?? "n/a"}
- Linked intake record: ${linkedIntakeRecord}
- Linked triage record: ${linkedTriageRecord ?? "n/a"}
`;
}

export function resolveDiscoveryRoutingRecordAbsolutePath(input: {
  directiveRoot: string;
  relativePath: string;
}) {
  const normalizedRelativePath = input.relativePath.replace(/\\/g, "/");
  const absolutePath = path.resolve(input.directiveRoot, normalizedRelativePath);
  const normalizedRoot = `${path.resolve(input.directiveRoot)}${path.sep}`;
  if (
    absolutePath !== path.resolve(input.directiveRoot) &&
    !absolutePath.startsWith(normalizedRoot)
  ) {
    throw new Error("routing record path must stay within directive-workspace");
  }
  return absolutePath;
}
