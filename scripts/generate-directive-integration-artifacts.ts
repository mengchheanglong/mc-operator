import fs from "node:fs";
import path from "node:path";
import {
  generateIntegrationArtifacts,
  writeGeneratedIntegrationArtifacts,
} from "../src/lib/directive-workspace/integration-artifact-generator";

type CliArgs = {
  experimentPath: string;
  outputDir: string;
  write: boolean;
  adoptionTarget?: string;
  integrationMode?: "reimplement" | "adapt" | "wrap";
  owner?: string;
};

function parseArgs(argv: string[]): CliArgs {
  let experimentPath = "";
  let outputDir = "";
  let write = false;
  let adoptionTarget: string | undefined;
  let integrationMode: "reimplement" | "adapt" | "wrap" | undefined;
  let owner: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--experiment-path") {
      experimentPath = String(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--output-dir") {
      outputDir = String(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--adoption-target") {
      adoptionTarget = String(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--integration-mode") {
      const value = String(argv[i + 1] || "").trim() as
        | "reimplement"
        | "adapt"
        | "wrap";
      if (value === "reimplement" || value === "adapt" || value === "wrap") {
        integrationMode = value;
      }
      i += 1;
    } else if (arg === "--owner") {
      owner = String(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--write") {
      write = true;
    }
  }

  if (!experimentPath) {
    throw new Error("missing --experiment-path");
  }

  const resolvedExperimentPath = path.resolve(experimentPath);
  const defaultOutputDir = path.resolve(
    process.cwd(),
    "..",
    "directive-workspace",
    "architecture",
    "05-reference-patterns",
  );
  return {
    experimentPath: resolvedExperimentPath,
    outputDir: outputDir ? path.resolve(outputDir) : defaultOutputDir,
    write,
    adoptionTarget,
    integrationMode,
    owner,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.experimentPath)) {
    throw new Error(`experiment file does not exist: ${args.experimentPath}`);
  }

  const experimentContent = fs.readFileSync(args.experimentPath, "utf8");
  const generated = generateIntegrationArtifacts({
    experimentArtifactPath: args.experimentPath,
    experimentArtifactContent: experimentContent,
    adoptionTarget: args.adoptionTarget,
    integrationMode: args.integrationMode,
    owner: args.owner,
  });

  let written: { integrationPath: string; proofPath: string } | null = null;
  if (args.write) {
    const date = new Date().toISOString().slice(0, 10);
    written = writeGeneratedIntegrationArtifacts({
      outputDir: args.outputDir,
      date,
      candidateId: generated.extraction.candidateId,
      integrationContractArtifact: generated.integrationContractArtifact,
      proofChecklistArtifact: generated.proofChecklistArtifact,
    });
  }

  const output = {
    ok: true,
    mode: args.write ? "write" : "preview",
    experimentPath: args.experimentPath,
    outputDir: args.outputDir,
    extraction: generated.extraction,
    written,
    preview: args.write
      ? null
      : {
          integrationContractArtifact: generated.integrationContractArtifact,
          proofChecklistArtifact: generated.proofChecklistArtifact,
        },
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const output = {
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(1);
}
