// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/discovery-intake-lifecycle-sync.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import fs from "node:fs";
import path from "node:path";
import {
  type DiscoveryIntakeQueueDocument,
  type DiscoveryIntakeQueueEntry,
  type DiscoveryRoutingTarget,
} from "./discovery-intake-queue-writer";
import { transitionDiscoveryIntakeQueueEntry } from "./discovery-intake-queue-transition";

export type DiscoveryLifecycleSyncTarget = "routed" | "completed";

export type DiscoveryIntakeLifecycleSyncRequest = {
  candidate_id: string;
  target_phase: DiscoveryLifecycleSyncTarget;
  routing_target?: DiscoveryRoutingTarget;
  assigned_worker?: string | null;
  intake_record_path?: string | null;
  fast_path_record_path?: string | null;
  routing_record_path?: string | null;
  result_record_path?: string | null;
  note_append?: string | null;
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

function resolveArtifactPath(input: {
  directiveRoot: string;
  relativePath: string | null;
  fieldName: string;
}) {
  if (!input.relativePath) {
    throw new Error(`${input.fieldName} is required`);
  }

  if (path.isAbsolute(input.relativePath)) {
    throw new Error(`${input.fieldName} must be relative to directive-workspace`);
  }

  const absolutePath = path.resolve(input.directiveRoot, input.relativePath);
  const normalizedRoot = `${path.resolve(input.directiveRoot)}${path.sep}`;
  if (
    absolutePath !== path.resolve(input.directiveRoot) &&
    !absolutePath.startsWith(normalizedRoot)
  ) {
    throw new Error(`${input.fieldName} must stay within directive-workspace`);
  }

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${input.fieldName} not found: ${input.relativePath}`);
  }

  return input.relativePath.replace(/\\/g, "/");
}

function resolveOptionalArtifactPath(input: {
  directiveRoot: string;
  relativePath: string | null;
  fieldName: string;
}) {
  return input.relativePath ? resolveArtifactPath(input) : null;
}

function getEntry(queue: DiscoveryIntakeQueueDocument, candidateId: string) {
  const entry = queue.entries.find((item) => item.candidate_id === candidateId);
  if (!entry) {
    throw new Error(`candidate_id not found in intake queue: ${candidateId}`);
  }
  return entry;
}

function updateEntryWithoutTransition(input: {
  queue: DiscoveryIntakeQueueDocument;
  currentEntry: DiscoveryIntakeQueueEntry;
  request: DiscoveryIntakeLifecycleSyncRequest;
  transitionDate: string;
  routingTarget: DiscoveryRoutingTarget;
  intakeRecordPath: string | null;
  fastPathRecordPath: string | null;
  routingRecordPath: string | null;
  resultRecordPath: string | null;
}) {
  const nextEntry: DiscoveryIntakeQueueEntry = {
    ...input.currentEntry,
    routing_target: input.routingTarget,
    assigned_worker:
      input.request.assigned_worker !== undefined
        ? optionalString(input.request.assigned_worker)
        : input.currentEntry.assigned_worker,
    intake_record_path: input.intakeRecordPath,
    fast_path_record_path: input.fastPathRecordPath,
    routing_record_path: input.routingRecordPath,
    result_record_path: input.resultRecordPath,
    routed_at:
      input.request.target_phase === "routed" ||
      input.request.target_phase === "completed"
        ? input.currentEntry.routed_at || input.transitionDate
        : input.currentEntry.routed_at,
    completed_at:
      input.request.target_phase === "completed"
        ? input.currentEntry.completed_at || input.transitionDate
        : input.currentEntry.completed_at,
    notes: mergeNotes(
      input.currentEntry.notes,
      optionalString(input.request.note_append),
    ),
  };

  return {
    entry: nextEntry,
    queue: {
      ...input.queue,
      updatedAt: input.transitionDate,
      entries: input.queue.entries.map((entry) =>
        entry.candidate_id === input.currentEntry.candidate_id ? nextEntry : entry,
      ),
    },
  };
}

export function syncDiscoveryIntakeLifecycle(input: {
  queue: DiscoveryIntakeQueueDocument;
  request: DiscoveryIntakeLifecycleSyncRequest;
  transitionDate: string;
  directiveRoot: string;
}) {
  const candidateId = requireCandidateId(input.request.candidate_id);
  let workingQueue = input.queue;
  let currentEntry = getEntry(workingQueue, candidateId);

  const routingTarget =
    input.request.routing_target !== undefined
      ? input.request.routing_target
      : currentEntry.routing_target;
  const intakeRecordPath =
    input.request.intake_record_path !== undefined
      ? optionalString(input.request.intake_record_path)
      : currentEntry.intake_record_path ?? null;
  const fastPathRecordPath =
    input.request.fast_path_record_path !== undefined
      ? optionalString(input.request.fast_path_record_path)
      : currentEntry.fast_path_record_path;
  const routingRecordPath =
    input.request.routing_record_path !== undefined
      ? optionalString(input.request.routing_record_path)
      : currentEntry.routing_record_path;
  const resultRecordPath =
    input.request.result_record_path !== undefined
      ? optionalString(input.request.result_record_path)
      : currentEntry.result_record_path;

  if (!routingTarget) {
    throw new Error("routing_target is required for lifecycle sync");
  }

  const normalizedIntakeRecord = resolveOptionalArtifactPath({
    directiveRoot: input.directiveRoot,
    relativePath: intakeRecordPath,
    fieldName: "intake_record_path",
  });
  const normalizedFastPath = resolveOptionalArtifactPath({
    directiveRoot: input.directiveRoot,
    relativePath: fastPathRecordPath,
    fieldName: "fast_path_record_path",
  });
  if (!normalizedIntakeRecord && !normalizedFastPath) {
    throw new Error(
      "one of intake_record_path or fast_path_record_path is required for lifecycle sync",
    );
  }
  const normalizedRoutingRecord =
    input.request.target_phase === "routed" || input.request.target_phase === "completed"
      ? resolveArtifactPath({
          directiveRoot: input.directiveRoot,
          relativePath: routingRecordPath,
          fieldName: "routing_record_path",
        })
      : routingRecordPath;

  const normalizedResultPath =
    input.request.target_phase === "completed"
      ? resolveArtifactPath({
          directiveRoot: input.directiveRoot,
          relativePath: resultRecordPath,
          fieldName: "result_record_path",
        })
      : resultRecordPath;

  if (input.request.target_phase === "routed" && currentEntry.status === "routed") {
    const result = updateEntryWithoutTransition({
      queue: workingQueue,
      currentEntry,
      request: input.request,
      transitionDate: input.transitionDate,
      routingTarget,
      intakeRecordPath: normalizedIntakeRecord,
      fastPathRecordPath: normalizedFastPath,
      routingRecordPath: normalizedRoutingRecord,
      resultRecordPath: normalizedResultPath,
    });
    return {
      ...result,
      appliedStages: ["routed"],
    };
  }

  if (
    input.request.target_phase === "completed" &&
    currentEntry.status === "completed"
  ) {
    const result = updateEntryWithoutTransition({
      queue: workingQueue,
      currentEntry,
      request: input.request,
      transitionDate: input.transitionDate,
      routingTarget,
      intakeRecordPath: normalizedIntakeRecord,
      fastPathRecordPath: normalizedFastPath,
      routingRecordPath: normalizedRoutingRecord,
      resultRecordPath: normalizedResultPath,
    });
    return {
      ...result,
      appliedStages: ["completed"],
    };
  }

  const appliedStages: string[] = [];

  const applyTransition = (request: {
    target_status: "pending" | "processing" | "routed" | "completed";
    routing_target?: DiscoveryRoutingTarget;
    assigned_worker?: string | null;
    intake_record_path?: string | null;
    fast_path_record_path?: string | null;
    routing_record_path?: string | null;
    result_record_path?: string | null;
    note_append?: string | null;
  }) => {
    const result = transitionDiscoveryIntakeQueueEntry({
      queue: workingQueue,
      request: {
        candidate_id: candidateId,
        ...request,
      },
      transitionDate: input.transitionDate,
    });
    workingQueue = result.queue;
    currentEntry = result.entry;
    appliedStages.push(result.entry.status);
  };

  if (currentEntry.status === "held") {
    applyTransition({
      target_status: "pending",
      assigned_worker: input.request.assigned_worker,
    });
  }

  if (currentEntry.status === "pending") {
    applyTransition({
      target_status: "processing",
      assigned_worker: input.request.assigned_worker,
    });
  }

  if (currentEntry.status === "processing") {
    applyTransition({
      target_status: "routed",
      routing_target: routingTarget,
      assigned_worker: input.request.assigned_worker,
      intake_record_path: normalizedIntakeRecord,
      fast_path_record_path: normalizedFastPath,
      routing_record_path: normalizedRoutingRecord,
      result_record_path: normalizedResultPath,
      note_append:
        input.request.target_phase === "routed"
          ? input.request.note_append
          : null,
    });
  }

  if (input.request.target_phase === "completed" && currentEntry.status === "routed") {
    applyTransition({
      target_status: "completed",
      routing_target: routingTarget,
      assigned_worker: input.request.assigned_worker,
      intake_record_path: normalizedIntakeRecord,
      routing_record_path: normalizedRoutingRecord,
      result_record_path: normalizedResultPath,
      note_append: input.request.note_append,
    });
  }

  if (currentEntry.status !== input.request.target_phase) {
    throw new Error(
      `lifecycle sync did not reach target phase: ${currentEntry.status} -> ${input.request.target_phase}`,
    );
  }

  return {
    entry: currentEntry,
    queue: workingQueue,
    appliedStages,
  };
}
