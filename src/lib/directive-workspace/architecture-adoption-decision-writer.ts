import {
  buildDirectiveArchitectureCloseoutFile,
  renderDirectiveArchitectureCloseoutFile,
  resolveDirectiveArchitectureCloseoutAbsolutePath,
  resolveDirectiveArchitectureCloseoutPath,
  type DirectiveArchitectureCloseoutWriteRequest,
} from "./architecture-closeout";
import type {
  DirectiveArchitectureAdoptionDecisionArtifact,
} from "./architecture-adoption-artifacts";
import type {
  ArchitectureAdoptionResolution,
} from "./architecture-adoption-resolution";
import type {
  ArchitectureReviewResolution,
} from "./architecture-review-resolution";

export type DirectiveArchitectureAdoptionDecisionWriteRequest =
  Omit<DirectiveArchitectureCloseoutWriteRequest, "recordRelativePath"> & {
    adoptedRecordRelativePath: string;
  };

export function resolveDirectiveArchitectureAdoptionDecisionPath(
  request: DirectiveArchitectureAdoptionDecisionWriteRequest,
) {
  return resolveDirectiveArchitectureCloseoutPath({
    ...request,
    recordRelativePath: request.adoptedRecordRelativePath,
  });
}

export function resolveDirectiveArchitectureAdoptionDecisionAbsolutePath(input: {
  directiveRoot: string;
  relativePath: string;
}) {
  return resolveDirectiveArchitectureCloseoutAbsolutePath(input);
}

export function buildDirectiveArchitectureAdoptionDecisionFile(
  request: DirectiveArchitectureAdoptionDecisionWriteRequest,
): {
  relativePath: string;
  reviewResolution: ArchitectureReviewResolution | null;
  adoptionResolution: ArchitectureAdoptionResolution;
  artifact: DirectiveArchitectureAdoptionDecisionArtifact;
} {
  const closeout = buildDirectiveArchitectureCloseoutFile({
    ...request,
    recordRelativePath: request.adoptedRecordRelativePath,
  });
  return {
    relativePath: closeout.relativePath,
    reviewResolution: closeout.reviewResolution,
    adoptionResolution: closeout.adoptionResolution,
    artifact: closeout.artifact,
  };
}

export function renderDirectiveArchitectureAdoptionDecisionFile(
  request: DirectiveArchitectureAdoptionDecisionWriteRequest,
) {
  return renderDirectiveArchitectureCloseoutFile({
    ...request,
    recordRelativePath: request.adoptedRecordRelativePath,
  });
}
