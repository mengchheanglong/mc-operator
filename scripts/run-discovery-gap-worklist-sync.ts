import fs from "node:fs";
import path from "node:path";
import {
  type CapabilityGapRecord,
  type DiscoveryQueueEntry,
  generateDiscoveryGapWorklist,
} from "../src/lib/directive-workspace/discovery-gap-worklist-generator";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const gapsPath = path.join(directiveRoot, "discovery", "capability-gaps.json");
  const queuePath = path.join(directiveRoot, "discovery", "intake-queue.json");
  const activeMissionPath = path.join(directiveRoot, "knowledge", "active-mission.md");
  const worklistPath = path.join(directiveRoot, "discovery", "gap-worklist.json");

  const gaps = readJson<{ updatedAt?: string; gaps: CapabilityGapRecord[] }>(gapsPath);
  const queue = readJson<{ updatedAt?: string; entries: DiscoveryQueueEntry[] }>(queuePath);
  const activeMissionMarkdown = fs.readFileSync(activeMissionPath, "utf8");

  const updatedAt = String(
    queue.updatedAt || gaps.updatedAt || new Date().toISOString().slice(0, 10),
  );
  const worklist = generateDiscoveryGapWorklist({
    updatedAt,
    gaps: gaps.gaps,
    intakeQueueEntries: queue.entries,
    activeMissionMarkdown,
  });

  fs.writeFileSync(worklistPath, `${JSON.stringify(worklist, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        outputPath: worklistPath,
        itemCount: worklist.items.length,
        updatedAt: worklist.updatedAt,
      },
      null,
      2,
    )}\n`,
  );
}

main();
