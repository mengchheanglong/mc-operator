// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/architecture-adoption-decision-envelope.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
export const DIRECTIVE_ARTIFACT_UNSET = Symbol(
  "directive-architecture-artifact-unset",
);

export const DIRECTIVE_ARCHITECTURE_ADOPTION_DECISION_FORMAT =
  "directive-architecture-adoption-decision-1.0";

type MergeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | symbol
  | MergeRecord
  | MergeValue[];

type MergeRecord = {
  [key: string]: MergeValue;
};

function isPlainRecord(value: MergeValue): value is MergeRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeDirectiveArtifactSections(
  ...sections: Array<MergeRecord | null | undefined>
): MergeRecord {
  const result: MergeRecord = {};

  for (const section of sections) {
    if (!section) {
      continue;
    }

    for (const [key, rawValue] of Object.entries(section)) {
      if (
        rawValue === undefined
        || rawValue === DIRECTIVE_ARTIFACT_UNSET
      ) {
        continue;
      }

      if (isPlainRecord(rawValue)) {
        const existing = result[key];
        result[key] = isPlainRecord(existing)
          ? mergeDirectiveArtifactSections(existing, rawValue)
          : mergeDirectiveArtifactSections(rawValue);
        continue;
      }

      result[key] = rawValue;
    }
  }

  return result;
}
