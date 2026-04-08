import fs from "node:fs";
import { submitDiscoveryEntry } from "../src/server/services/directive-discovery-submission-service";
import type { DiscoverySubmissionRequest } from "../src/lib/directive-workspace/discovery-submission-router";

function parseArgs(argv: string[]) {
  const args = {
    inputJsonPath: "",
    queuePath: "",
    directiveRoot: "",
    dryRun: false,
    processWithEngine: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-json-path") {
      args.inputJsonPath = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (token === "--queue-path") {
      args.queuePath = argv[index + 1] || "";
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
      continue;
    }
    if (token === "--process-with-engine") {
      args.processWithEngine = true;
    }
  }

  if (!args.inputJsonPath) {
    throw new Error("Missing required argument: --input-json-path");
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.inputJsonPath)) {
    throw new Error(`Input payload not found: ${args.inputJsonPath}`);
  }

  const request = JSON.parse(
    fs.readFileSync(args.inputJsonPath, "utf8"),
  ) as DiscoverySubmissionRequest;

  const result = await submitDiscoveryEntry({
    request,
    directiveRoot: args.directiveRoot || undefined,
    queuePath: args.queuePath || undefined,
    dryRun: args.dryRun,
    processWithEngine: args.processWithEngine,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main();
