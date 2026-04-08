import fs from "node:fs";
import path from "node:path";
import {
  loadDirectiveArchitectureCycleDecisionArtifacts,
} from "../src/lib/directive-workspace/architecture-cycle-decision-loader";

type ArchitectureWaveEvaluationRequest = {
  recordRelativePaths: string[];
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""),
  ) as T;
}

function parseArgs(argv: string[]) {
  const args = {
    inputJsonPath: "",
    directiveRoot: "",
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

  const request = readJsonFile<ArchitectureWaveEvaluationRequest>(
    args.inputJsonPath,
  );
  if (!Array.isArray(request.recordRelativePaths) || request.recordRelativePaths.length === 0) {
    throw new Error("recordRelativePaths must be a non-empty array");
  }

  const result = loadDirectiveArchitectureCycleDecisionArtifacts({
    directiveRoot,
    recordRelativePaths: request.recordRelativePaths,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        reviewedRecords: result.records.map((record) => ({
          recordRelativePath: record.recordRelativePath,
          decisionRelativePath: record.decisionRelativePath,
          verdict: record.artifact.decision.verdict,
        })),
        summary: result.summary,
      },
      null,
      2,
    )}\n`,
  );
}

main();
