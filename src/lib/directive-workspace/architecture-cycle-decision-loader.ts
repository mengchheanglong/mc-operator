// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/architecture-cycle-decision-loader.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import type {
  DirectiveArchitectureAdoptionDecisionArtifact,
} from "./architecture-adoption-artifacts";
import {
  listDirectiveArchitectureAdoptionDecisionArtifacts,
} from "./architecture-adoption-decision-store";
import {
  summarizeDirectiveArchitectureCycleDecisions,
  type DirectiveArchitectureCycleDecisionSummary,
} from "./architecture-cycle-decision-summary";

export type DirectiveArchitectureCycleDecisionRecordLoad = {
  recordRelativePath: string;
  decisionRelativePath: string;
  artifact: DirectiveArchitectureAdoptionDecisionArtifact;
};

export type DirectiveArchitectureCycleDecisionLoadResult = {
  records: DirectiveArchitectureCycleDecisionRecordLoad[];
  summary: DirectiveArchitectureCycleDecisionSummary;
};

export function loadDirectiveArchitectureCycleDecisionArtifacts(input: {
  directiveRoot: string;
  recordRelativePaths: string[];
}): DirectiveArchitectureCycleDecisionLoadResult {
  const records = listDirectiveArchitectureAdoptionDecisionArtifacts({
    directiveRoot: input.directiveRoot,
    recordRelativePaths: input.recordRelativePaths,
  }).map((record) => ({
    recordRelativePath: record.recordRelativePath,
    decisionRelativePath: record.decisionRelativePath,
    artifact: record.artifact,
  }));

  return {
    records,
    summary: summarizeDirectiveArchitectureCycleDecisions({
      adoptionArtifacts: records.map((record) => record.artifact),
    }),
  };
}
