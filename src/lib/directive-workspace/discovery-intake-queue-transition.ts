// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-intake-queue-transition.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import {
  type DiscoveryIntakeQueueDocument,
  type DiscoveryIntakeQueueEntry,
  type DiscoveryRoutingTarget,
} from "./discovery-intake-queue-writer";

export type DiscoveryTransitionTarget =
  | "processing"
  | "routed"
  | "completed"
  | "held"
  | "pending";

export type DiscoveryIntakeTransitionRequest = {
  candidate_id: string;
  target_status: DiscoveryTransitionTarget;
  routing_target?: DiscoveryRoutingTarget;
  assigned_worker?: string | null;
  intake_record_path?: string | null;
  fast_path_record_path?: string | null;
  routing_record_path?: string | null;
  result_record_path?: string | null;
  note_append?: string | null;
};

const ALLOWED_TRANSITIONS: Record<string, DiscoveryTransitionTarget[]> = {
  pending: ["processing", "held"],
  processing: ["pending", "routed", "held"],
  routed: ["completed", "held"],
  held: ["pending"],
  completed: [],
};

function optionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireCandidateId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("candidate_id is required");
  }
  return trimmed;
}

function mergeNotes(existing: string | null, appended: string | null) {
  if (!appended) {
    return existing ?? null;
  }
  if (!existing) {
    return appended;
  }
  return `${existing} | ${appended}`;
}

function validateTransition(input: {
  currentEntry: DiscoveryIntakeQueueEntry;
  request: DiscoveryIntakeTransitionRequest;
}) {
  const allowed = ALLOWED_TRANSITIONS[input.currentEntry.status] || [];
  if (!allowed.includes(input.request.target_status)) {
    throw new Error(
      `invalid queue transition: ${input.currentEntry.status} -> ${input.request.target_status}`,
    );
  }

  if (input.request.target_status === "routed") {
    if (!input.request.routing_target) {
      throw new Error("routing_target is required when target_status is routed");
    }
  }

  if (input.request.target_status === "completed") {
    if (!input.currentEntry.routing_target && !input.request.routing_target) {
      throw new Error(
        "completed transition requires an existing or provided routing_target",
      );
    }
    if (!optionalString(input.request.result_record_path)) {
      throw new Error(
        "result_record_path is required when target_status is completed",
      );
    }
  }
}

export function transitionDiscoveryIntakeQueueEntry(input: {
  queue: DiscoveryIntakeQueueDocument;
  request: DiscoveryIntakeTransitionRequest;
  transitionDate: string;
}) {
  const candidateId = requireCandidateId(input.request.candidate_id);
  const entryIndex = input.queue.entries.findIndex(
    (entry) => entry.candidate_id === candidateId,
  );

  if (entryIndex < 0) {
    throw new Error(`candidate_id not found in intake queue: ${candidateId}`);
  }

  const currentEntry = input.queue.entries[entryIndex];
  validateTransition({
    currentEntry,
    request: input.request,
  });

  const nextRoutingTarget =
    input.request.routing_target !== undefined
      ? input.request.routing_target
      : currentEntry.routing_target;
  const nextAssignedWorker =
    input.request.assigned_worker !== undefined
      ? optionalString(input.request.assigned_worker)
      : currentEntry.assigned_worker;
  const nextIntakeRecordPath =
    input.request.intake_record_path !== undefined
      ? optionalString(input.request.intake_record_path)
      : currentEntry.intake_record_path ?? null;
  const nextFastPathRecordPath =
    input.request.fast_path_record_path !== undefined
      ? optionalString(input.request.fast_path_record_path)
      : currentEntry.fast_path_record_path;
  const nextRoutingRecordPath =
    input.request.routing_record_path !== undefined
      ? optionalString(input.request.routing_record_path)
      : currentEntry.routing_record_path;
  const nextResultRecordPath =
    input.request.result_record_path !== undefined
      ? optionalString(input.request.result_record_path)
      : currentEntry.result_record_path;
  const nextNotes = mergeNotes(
    currentEntry.notes,
    optionalString(input.request.note_append),
  );

  const nextEntry: DiscoveryIntakeQueueEntry = {
    ...currentEntry,
    status: input.request.target_status,
    routing_target: nextRoutingTarget,
    assigned_worker: nextAssignedWorker,
    intake_record_path: nextIntakeRecordPath,
    fast_path_record_path: nextFastPathRecordPath,
    routing_record_path: nextRoutingRecordPath,
    result_record_path: nextResultRecordPath,
    notes: nextNotes,
    routed_at:
      input.request.target_status === "routed" ||
      input.request.target_status === "completed"
        ? currentEntry.routed_at || input.transitionDate
        : currentEntry.routed_at,
    completed_at:
      input.request.target_status === "completed"
        ? input.transitionDate
        : currentEntry.completed_at,
  };

  const nextEntries = [...input.queue.entries];
  nextEntries[entryIndex] = nextEntry;

  return {
    entry: nextEntry,
    queue: {
      ...input.queue,
      updatedAt: input.transitionDate,
      entries: nextEntries,
    },
  };
}
