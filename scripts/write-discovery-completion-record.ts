import fs from "node:fs";
import path from "node:path";
import {
  renderDiscoveryCompletionRecord,
  resolveDiscoveryCompletionRecordAbsolutePath,
  type DiscoveryCompletionRecordRequest,
} from "../src/lib/directive-workspace/discovery-completion-record-writer";
import {
  type DiscoveryIntakeLifecycleSyncRequest,
  syncDiscoveryIntakeLifecycle,
} from "../src/lib/directive-workspace/discovery-intake-lifecycle-sync";
import type { DiscoveryIntakeQueueDocument } from "../src/lib/directive-workspace/discovery-intake-queue-writer";

function writeUtf8(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJsonNoBom(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv: string[]) {
  const args = {
    inputJsonPath: "",
    queuePath: "",
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
  const queuePath =
    args.queuePath || path.join(directiveRoot, "discovery", "intake-queue.json");

  if (!fs.existsSync(args.inputJsonPath)) {
    throw new Error(`Input payload not found: ${args.inputJsonPath}`);
  }
  if (!fs.existsSync(queuePath)) {
    throw new Error(`Discovery queue not found: ${queuePath}`);
  }

  const request = JSON.parse(
    fs.readFileSync(args.inputJsonPath, "utf8"),
  ) as DiscoveryCompletionRecordRequest;
  const queue = JSON.parse(
    fs.readFileSync(queuePath, "utf8"),
  ) as DiscoveryIntakeQueueDocument;
  const completionRecordAbsolutePath = resolveDiscoveryCompletionRecordAbsolutePath({
    directiveRoot,
    relativePath: request.output_relative_path,
  });
  const markdown = renderDiscoveryCompletionRecord(request);

  if (!args.dryRun) {
    writeUtf8(completionRecordAbsolutePath, markdown);
  }

  const lifecycleRequest: DiscoveryIntakeLifecycleSyncRequest = {
    candidate_id: request.candidate_id,
    target_phase: "completed",
    routing_target: request.route_destination,
    intake_record_path: request.linked_intake_record,
    routing_record_path: request.linked_routing_record,
    result_record_path: request.output_relative_path,
    note_append: `completion record created: ${request.output_relative_path}`,
  };

  const result = syncDiscoveryIntakeLifecycle({
    queue,
    request: lifecycleRequest,
    transitionDate: request.decision_date,
    directiveRoot,
  });

  if (args.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          mode: "dry_run",
          queuePath,
          completionRecordPath: request.output_relative_path,
          appliedStages: result.appliedStages,
          entry: result.entry,
          markdownPreview: markdown,
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
        mode: "written",
        queuePath,
        completionRecordPath: request.output_relative_path,
        candidate_id: result.entry.candidate_id,
        status: result.entry.status,
        appliedStages: result.appliedStages,
      },
      null,
      2,
    )}\n`,
  );
}

main();
