// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/architecture-closeout.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import path from "node:path";
import {
  buildDirectiveArchitectureAdoptionDecisionArtifact,
  type DirectiveArchitectureAdoptionDecisionArtifact,
  type DirectiveArchitectureAdoptionDecisionArtifactInput,
} from "./architecture-adoption-artifacts";
import {
  resolveArchitectureAdoption,
  type ArchitectureAdoptionResolution,
  type ArchitectureAdoptionVerdict,
} from "./architecture-adoption-resolution";
import {
  resolveArchitectureReview,
  type ArchitectureReviewResolution,
  type ArchitectureReviewResolutionInput,
} from "./architecture-review-resolution";

export type DirectiveArchitectureCloseoutRecordState = "experiment" | "adopted";
export type DirectiveArchitectureCloseoutState =
  | "stay_experimental"
  | "adopted"
  | "forge_handoff";

export type DirectiveArchitectureCloseoutWriteRequest =
  Omit<
    DirectiveArchitectureAdoptionDecisionArtifactInput,
    "reviewResolution" | "adoptionResolution"
  > & {
    recordRelativePath: string;
    outputRelativePath?: string | null;
    reviewInput?: ArchitectureReviewResolutionInput;
    reviewResolution?: ArchitectureReviewResolution;
    adoptionResolution?: ArchitectureAdoptionResolution;
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

export function resolveDirectiveArchitectureCloseoutRecordState(
  recordRelativePath: string,
): DirectiveArchitectureCloseoutRecordState {
  const normalizedRelativePath = requiredString(
    recordRelativePath,
    "recordRelativePath",
  ).replace(/\\/g, "/");

  if (!normalizedRelativePath.endsWith(".md")) {
    throw new Error("recordRelativePath must end with .md");
  }

  if (normalizedRelativePath.startsWith("architecture/02-experiments/")) {
    return "experiment";
  }
  if (normalizedRelativePath.startsWith("architecture/03-adopted/")) {
    return "adopted";
  }

  throw new Error(
    "recordRelativePath must point to architecture/02-experiments/ or architecture/03-adopted/",
  );
}

function resolveDirectiveArchitectureCloseoutFilename(recordRelativePath: string) {
  const recordFilename = path.posix.basename(recordRelativePath.replace(/\\/g, "/"));
  return recordFilename
    .replace(/-adopted\.md$/u, "-adoption-decision.json")
    .replace(/\.md$/u, "-adoption-decision.json");
}

export function resolveDirectiveArchitectureCloseoutPathForRecord(
  recordRelativePath: string,
) {
  const normalizedRecordRelativePath = requiredString(
    recordRelativePath,
    "recordRelativePath",
  ).replace(/\\/g, "/");
  resolveDirectiveArchitectureCloseoutRecordState(normalizedRecordRelativePath);

  return path.posix.join(
    path.posix.dirname(normalizedRecordRelativePath),
    resolveDirectiveArchitectureCloseoutFilename(normalizedRecordRelativePath),
  );
}

function resolveDirectiveArchitectureCloseoutState(
  verdict: ArchitectureAdoptionVerdict,
): DirectiveArchitectureCloseoutState {
  if (verdict === "adopt") {
    return "adopted";
  }
  if (verdict === "hand_off_to_forge") {
    return "forge_handoff";
  }
  return "stay_experimental";
}

function assertDirectiveArchitectureCloseoutStateMatchesRecord(input: {
  recordState: DirectiveArchitectureCloseoutRecordState;
  closeoutState: DirectiveArchitectureCloseoutState;
}) {
  if (input.closeoutState === "stay_experimental" && input.recordState !== "experiment") {
    throw new Error(
      "stay-experimental Architecture closeout must target a record under architecture/02-experiments/",
    );
  }

  if (input.closeoutState !== "stay_experimental" && input.recordState !== "adopted") {
    throw new Error(
      "adopted or Forge-handoff Architecture closeout must target a record under architecture/03-adopted/",
    );
  }
}

export function resolveDirectiveArchitectureCloseoutPath(
  request: DirectiveArchitectureCloseoutWriteRequest,
) {
  const explicit = optionalString(request.outputRelativePath);
  if (explicit) {
    return explicit.replace(/\\/g, "/");
  }

  const recordRelativePath = requiredString(
    request.recordRelativePath,
    "recordRelativePath",
  ).replace(/\\/g, "/");
  return resolveDirectiveArchitectureCloseoutPathForRecord(recordRelativePath);
}

export function resolveDirectiveArchitectureCloseoutAbsolutePath(input: {
  directiveRoot: string;
  relativePath: string;
}) {
  const normalizedRelativePath = input.relativePath.replace(/\\/g, "/");
  const absolutePath = path.resolve(input.directiveRoot, normalizedRelativePath);
  const normalizedRoot = `${path.resolve(input.directiveRoot)}${path.sep}`;
  if (
    absolutePath !== path.resolve(input.directiveRoot)
    && !absolutePath.startsWith(normalizedRoot)
  ) {
    throw new Error("architecture closeout path must stay within directive-workspace");
  }
  return absolutePath;
}

export function buildDirectiveArchitectureCloseoutFile(
  request: DirectiveArchitectureCloseoutWriteRequest,
): {
  relativePath: string;
  recordState: DirectiveArchitectureCloseoutRecordState;
  closeoutState: DirectiveArchitectureCloseoutState;
  reviewResolution: ArchitectureReviewResolution | null;
  adoptionResolution: ArchitectureAdoptionResolution;
  artifact: DirectiveArchitectureAdoptionDecisionArtifact;
} {
  const recordState = resolveDirectiveArchitectureCloseoutRecordState(
    request.recordRelativePath,
  );
  const relativePath = resolveDirectiveArchitectureCloseoutPath(request);
  const {
    recordRelativePath: _recordRelativePath,
    outputRelativePath: _outputRelativePath,
    reviewInput,
    reviewResolution: requestReviewResolution,
    adoptionResolution: requestAdoptionResolution,
    ...artifactInput
  } = request;

  const reviewResolution =
    requestReviewResolution ?? (reviewInput ? resolveArchitectureReview(reviewInput) : null);
  const adoptionResolution =
    requestAdoptionResolution
    ?? resolveArchitectureAdoption({
      ...artifactInput,
      reviewResolution: reviewResolution ?? undefined,
    });
  const closeoutState = resolveDirectiveArchitectureCloseoutState(
    adoptionResolution.verdict,
  );

  assertDirectiveArchitectureCloseoutStateMatchesRecord({
    recordState,
    closeoutState,
  });

  const artifact = buildDirectiveArchitectureAdoptionDecisionArtifact({
    ...artifactInput,
    reviewResolution: reviewResolution ?? undefined,
    adoptionResolution,
  });

  return {
    relativePath,
    recordState,
    closeoutState,
    reviewResolution,
    adoptionResolution,
    artifact,
  };
}

export function renderDirectiveArchitectureCloseoutFile(
  request: DirectiveArchitectureCloseoutWriteRequest,
) {
  const file = buildDirectiveArchitectureCloseoutFile(request);
  return `${JSON.stringify(file.artifact, null, 2)}\n`;
}
