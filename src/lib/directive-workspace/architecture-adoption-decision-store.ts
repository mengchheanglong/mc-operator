// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/architecture-adoption-decision-store.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import fs from "node:fs";
import path from "node:path";
import {
  isDirectiveArchitectureAdoptionDecisionArtifact,
  type DirectiveArchitectureAdoptionDecisionArtifact,
} from "./architecture-adoption-artifacts";
import {
  resolveDirectiveArchitectureCloseoutAbsolutePath,
  resolveDirectiveArchitectureCloseoutPathForRecord,
} from "./architecture-closeout";

export type DirectiveArchitectureAdoptionDecisionStoreRecord = {
  recordRelativePath: string;
  decisionRelativePath: string;
  decisionAbsolutePath: string;
  artifact: DirectiveArchitectureAdoptionDecisionArtifact;
};

function normalizeRelativePath(relativePath: string, fieldName: string) {
  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return relativePath.trim().replace(/\\/g, "/");
}

function writeJsonAtomic(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function readJson(filePath: string) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""),
  ) as unknown;
}

function resolveStoredDecisionPaths(input: {
  directiveRoot: string;
  recordRelativePath: string;
  outputRelativePath?: string | null;
}) {
  const recordRelativePath = normalizeRelativePath(
    input.recordRelativePath,
    "recordRelativePath",
  );
  const decisionRelativePath = normalizeRelativePath(
    input.outputRelativePath || resolveDirectiveArchitectureCloseoutPathForRecord(recordRelativePath),
    "outputRelativePath",
  );
  const decisionAbsolutePath = resolveDirectiveArchitectureCloseoutAbsolutePath({
    directiveRoot: input.directiveRoot,
    relativePath: decisionRelativePath,
  });

  return {
    recordRelativePath,
    decisionRelativePath,
    decisionAbsolutePath,
  };
}

export function getDirectiveArchitectureAdoptionDecisionArtifact(input: {
  directiveRoot: string;
  recordRelativePath: string;
  outputRelativePath?: string | null;
}): DirectiveArchitectureAdoptionDecisionStoreRecord | null {
  const resolved = resolveStoredDecisionPaths(input);
  if (!fs.existsSync(resolved.decisionAbsolutePath)) {
    return null;
  }

  const parsed = readJson(resolved.decisionAbsolutePath);
  if (!isDirectiveArchitectureAdoptionDecisionArtifact(parsed)) {
    throw new Error(
      `Invalid architecture adoption decision artifact for record: ${resolved.recordRelativePath}`,
    );
  }

  return {
    ...resolved,
    artifact: parsed,
  };
}

export function loadDirectiveArchitectureAdoptionDecisionArtifact(input: {
  directiveRoot: string;
  recordRelativePath: string;
  outputRelativePath?: string | null;
}): DirectiveArchitectureAdoptionDecisionStoreRecord {
  const loaded = getDirectiveArchitectureAdoptionDecisionArtifact(input);
  if (!loaded) {
    throw new Error(
      `Missing architecture adoption decision artifact for record: ${normalizeRelativePath(
        input.recordRelativePath,
        "recordRelativePath",
      )}`,
    );
  }
  return loaded;
}

export function listDirectiveArchitectureAdoptionDecisionArtifacts(input: {
  directiveRoot: string;
  recordRelativePaths: string[];
}): DirectiveArchitectureAdoptionDecisionStoreRecord[] {
  return input.recordRelativePaths.map((recordRelativePath) =>
    loadDirectiveArchitectureAdoptionDecisionArtifact({
      directiveRoot: input.directiveRoot,
      recordRelativePath,
    }),
  );
}

export function upsertDirectiveArchitectureAdoptionDecisionArtifact(input: {
  directiveRoot: string;
  recordRelativePath: string;
  outputRelativePath?: string | null;
  artifact: DirectiveArchitectureAdoptionDecisionArtifact;
}): DirectiveArchitectureAdoptionDecisionStoreRecord {
  const resolved = resolveStoredDecisionPaths(input);
  writeJsonAtomic(resolved.decisionAbsolutePath, input.artifact);

  return {
    ...resolved,
    artifact: input.artifact,
  };
}

export function deleteDirectiveArchitectureAdoptionDecisionArtifact(input: {
  directiveRoot: string;
  recordRelativePath: string;
  outputRelativePath?: string | null;
}) {
  const resolved = resolveStoredDecisionPaths(input);
  if (!fs.existsSync(resolved.decisionAbsolutePath)) {
    return false;
  }
  fs.unlinkSync(resolved.decisionAbsolutePath);
  return true;
}
