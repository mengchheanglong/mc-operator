import fs from "node:fs";
import path from "node:path";
import {
  buildDirectiveArchitectureAdoptionDecisionFile,
  resolveDirectiveArchitectureAdoptionDecisionAbsolutePath,
  type DirectiveArchitectureAdoptionDecisionWriteRequest,
} from "../src/lib/directive-workspace/architecture-adoption-decision-writer";
import {
  upsertDirectiveArchitectureAdoptionDecisionArtifact,
} from "../src/lib/directive-workspace/architecture-adoption-decision-store";

function readJsonFile<T>(filePath: string) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""),
  ) as T;
}

function parseArgs(argv: string[]) {
  const args = {
    inputJsonPath: "",
    directiveRoot: "",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-json-path") {
      args.inputJsonPath = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (token === "--directive-root") {
      args.directiveRoot = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  if (!args.inputJsonPath) {
    throw new Error("Missing required argument: --input-json-path");
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const directiveRoot =
    args.directiveRoot || path.resolve(process.cwd(), "..", "directive-workspace");

  if (!fs.existsSync(args.inputJsonPath)) {
    throw new Error(`Input payload not found: ${args.inputJsonPath}`);
  }

  const request = readJsonFile<DirectiveArchitectureAdoptionDecisionWriteRequest>(
    args.inputJsonPath,
  );

  const file = buildDirectiveArchitectureAdoptionDecisionFile(request);
  const absolutePath = resolveDirectiveArchitectureAdoptionDecisionAbsolutePath({
    directiveRoot,
    relativePath: file.relativePath,
  });

  if (!args.dryRun) {
    upsertDirectiveArchitectureAdoptionDecisionArtifact({
      directiveRoot,
      recordRelativePath: request.adoptedRecordRelativePath,
      outputRelativePath: file.relativePath,
      artifact: file.artifact,
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: args.dryRun ? "dry_run" : "written",
        outputRelativePath: file.relativePath,
        outputAbsolutePath: absolutePath,
        reviewResult: file.reviewResolution?.reviewResult ?? "not_run",
        reviewScore: file.reviewResolution?.reviewScore ?? null,
        verdict: file.artifact.decision.verdict,
        artifactType: file.artifact.artifact_type,
      },
      null,
      2,
    )}\n`,
  );
}

main();
