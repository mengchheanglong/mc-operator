import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv: string[]) {
  const args = {
    directiveRoot: "",
    inputJsonPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--directive-root") {
      args.directiveRoot = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (token === "--input-json-path") {
      args.inputJsonPath = argv[index + 1] || "";
      index += 1;
    }
  }

  if (!args.directiveRoot) {
    throw new Error("Missing required argument: --directive-root");
  }
  if (!args.inputJsonPath) {
    throw new Error("Missing required argument: --input-json-path");
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const directiveRoot = path.resolve(args.directiveRoot);
  const inputJsonPath = path.resolve(args.inputJsonPath);

  if (!fs.existsSync(inputJsonPath)) {
    throw new Error(`Input payload not found: ${inputJsonPath}`);
  }

  const engineModuleUrl = pathToFileURL(
    path.join(directiveRoot, "engine", "index.ts"),
  ).href;
  const engineModule = await import(engineModuleUrl) as {
    DirectiveEngine?: new (input: { laneSet: unknown }) => {
      processSource: (input: unknown) => Promise<unknown>;
    };
    createDirectiveWorkspaceEngineLanes?: () => unknown;
  };

  if (
    typeof engineModule.DirectiveEngine !== "function"
    || typeof engineModule.createDirectiveWorkspaceEngineLanes !== "function"
  ) {
    throw new Error(
      `Directive Engine boundary exports missing from ${engineModuleUrl}`,
    );
  }

  const input = JSON.parse(fs.readFileSync(inputJsonPath, "utf8")) as {
    source: unknown;
    mission: unknown;
    gaps: unknown;
    receivedAt: string;
  };

  const engine = new engineModule.DirectiveEngine({
    laneSet: engineModule.createDirectiveWorkspaceEngineLanes(),
  });
  const result = await engine.processSource(input);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main();
