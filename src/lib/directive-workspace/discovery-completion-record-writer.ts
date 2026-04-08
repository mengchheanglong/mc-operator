// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-completion-record-writer.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import path from "node:path";
import type { DiscoveryRoutingTarget } from "./discovery-intake-queue-writer";

export type DiscoveryCompletionDecisionState =
  | "adopt"
  | "defer"
  | "monitor"
  | "reject";

export type DiscoveryCompletionRecordRequest = {
  candidate_id: string;
  candidate_name: string;
  decision_date: string;
  decision_state: DiscoveryCompletionDecisionState;
  adoption_target: string;
  route_destination: Exclude<DiscoveryRoutingTarget, null>;
  rationale: string;
  evidence_path: string;
  validation_method: string;
  rollback_note: string;
  linked_intake_record: string;
  linked_routing_record: string;
  output_relative_path: string;
  excluded_baggage?: string | null;
  risk_note?: string | null;
  follow_up_owner?: string | null;
  follow_up_path?: string | null;
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

export function renderDiscoveryCompletionRecord(
  request: DiscoveryCompletionRecordRequest,
) {
  const candidateId = requiredString(request.candidate_id, "candidate_id");
  const candidateName = requiredString(request.candidate_name, "candidate_name");
  const decisionDate = requiredString(request.decision_date, "decision_date");
  const decisionState = requiredString(request.decision_state, "decision_state");
  const adoptionTarget = requiredString(request.adoption_target, "adoption_target");
  const routeDestination = requiredString(
    request.route_destination,
    "route_destination",
  );
  const rationale = requiredString(request.rationale, "rationale");
  const evidencePath = requiredString(request.evidence_path, "evidence_path");
  const validationMethod = requiredString(
    request.validation_method,
    "validation_method",
  );
  const rollbackNote = requiredString(request.rollback_note, "rollback_note");
  const linkedIntakeRecord = requiredString(
    request.linked_intake_record,
    "linked_intake_record",
  );
  const linkedRoutingRecord = requiredString(
    request.linked_routing_record,
    "linked_routing_record",
  );
  const excludedBaggage = optionalString(request.excluded_baggage);
  const riskNote = optionalString(request.risk_note);
  const followUpOwner = optionalString(request.follow_up_owner);
  const followUpPath = optionalString(request.follow_up_path);

  return `# Discovery Completion Record: ${candidateName}

Date: ${decisionDate}

- Candidate id: ${candidateId}
- Candidate name: ${candidateName}
- Decision date: ${decisionDate}
- Decision state: ${decisionState}
- Adoption target: ${adoptionTarget}
- Route destination: ${routeDestination}
- Rationale: ${rationale}
- Evidence path: ${evidencePath}
- Validation method: ${validationMethod}
- Excluded baggage: ${excludedBaggage ?? "n/a"}
- Risk note: ${riskNote ?? "n/a"}
- Rollback note: ${rollbackNote}
- Follow-up owner: ${followUpOwner ?? "n/a"}
- Follow-up path: ${followUpPath ?? "n/a"}
- Linked intake record: ${linkedIntakeRecord}
- Linked routing record: ${linkedRoutingRecord}
`;
}

export function resolveDiscoveryCompletionRecordAbsolutePath(input: {
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
    throw new Error("completion record path must stay within directive-workspace");
  }
  return absolutePath;
}
