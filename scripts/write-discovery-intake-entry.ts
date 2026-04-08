import fs from "node:fs";
import path from "node:path";
import {
  type DiscoveryIntakeQueueDocument,
  type DiscoveryIntakeSubmission,
  appendDiscoveryIntakeQueueEntry,
} from "../src/lib/directive-workspace/discovery-intake-queue-writer";

function writeJsonNoBom(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv: string[]) {
  const args = {
    inputJsonPath: "",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-json-path") {
      args.inputJsonPath = argv[index + 1] || "";
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
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const queuePath = path.join(directiveRoot, "discovery", "intake-queue.json");
  const gapsPath = path.join(directiveRoot, "discovery", "capability-gaps.json");

  if (!fs.existsSync(args.inputJsonPath)) {
    throw new Error(`Input payload not found: ${args.inputJsonPath}`);
  }

  const submission = JSON.parse(
    fs.readFileSync(args.inputJsonPath, "utf8"),
  ) as DiscoveryIntakeSubmission;
  const queue = JSON.parse(
    fs.readFileSync(queuePath, "utf8"),
  ) as DiscoveryIntakeQueueDocument;
  const gaps = JSON.parse(
    fs.readFileSync(gapsPath, "utf8"),
  ) as { gaps?: Array<{ gap_id: string; resolved_at?: string | null }> };

  const unresolvedGapIds = (gaps.gaps || [])
    .filter((gap) => !gap.resolved_at)
    .map((gap) => gap.gap_id);
  const receivedAt = new Date().toISOString().slice(0, 10);

  const result = appendDiscoveryIntakeQueueEntry({
    queue,
    submission,
    receivedAt,
    unresolvedGapIds,
  });

  if (args.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          mode: "dry_run",
          queuePath,
          entry: result.entry,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  writeJsonNoBom(queuePath, result.queue);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: "submitted",
        queuePath,
        candidate_id: result.entry.candidate_id,
      },
      null,
      2,
    )}\n`,
  );
}

main();
