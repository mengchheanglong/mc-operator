import fs from "node:fs";
import path from "node:path";

type DeferredItem = {
  candidateId: string;
  triggerConditions: string[];
  reviewCadence: string | null;
  lastReviewResult: string | null;
};

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const monitorDir = path.join(directiveRoot, "discovery", "monitor");

  if (!fs.existsSync(monitorDir)) {
    console.log("INFO: monitor directory does not exist (nothing to check)");
    process.exit(0);
  }

  const files = fs
    .readdirSync(monitorDir)
    .filter((f) => f.endsWith(".md") && f !== "README.md");

  const deferred: DeferredItem[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(monitorDir, file), "utf8");

    // Only process records with decision state: defer
    const stateMatch = content.match(
      /^- Current decision state:\s*`?([^`\n]+)`?/m,
    );
    const state = stateMatch?.[1]?.trim();
    if (state !== "defer") continue;

    // Extract candidate id
    const candidateIdMatch = content.match(/^- Candidate id:\s*`?([^`\n]+)`?/m);
    const candidateId = candidateIdMatch?.[1]?.trim() ?? file;

    // Extract trigger conditions — collect lines after "Promotion trigger conditions:" until the next field
    const triggerMatch = content.match(
      /^- Promotion trigger conditions:\s*\n((?:\s+- .+\n?)*)/m,
    );
    const triggerBlock = triggerMatch?.[1] ?? "";
    const triggerConditions = triggerBlock
      .split("\n")
      .map((line) => line.replace(/^\s+-\s*/, "").trim())
      .filter(Boolean);

    // Extract review cadence
    const cadenceMatch = content.match(
      /^- Review cadence:\s*`?([^`\n]+)`?/m,
    );
    const reviewCadence = cadenceMatch?.[1]?.trim() ?? null;

    // Extract last review result
    const lastReviewMatch = content.match(
      /^- Last review result:\s*`?([^`\n]+)`?/m,
    );
    const lastReviewResult = lastReviewMatch?.[1]?.trim() ?? null;

    deferred.push({
      candidateId,
      triggerConditions,
      reviewCadence,
      lastReviewResult,
    });
  }

  if (deferred.length === 0) {
    console.log("INFO: no deferred monitor items found");
    process.exit(0);
  }

  console.log(
    `Discovery deferred-trigger report: ${deferred.length} deferred item(s)\n`,
  );

  for (const item of deferred) {
    console.log(`  Candidate: ${item.candidateId}`);
    if (item.triggerConditions.length > 0) {
      console.log(`  Trigger conditions:`);
      for (const tc of item.triggerConditions) {
        console.log(`    - ${tc}`);
      }
    } else {
      console.log(`  Trigger conditions: (none specified)`);
    }
    console.log(`  Review cadence: ${item.reviewCadence ?? "(not set)"}`);
    console.log(
      `  Last review: ${item.lastReviewResult ?? "(not set)"}\n`,
    );
  }

  // Informational only — always exit 0
  console.log("INFO: deferred-trigger report complete (informational, not a gate)");
  process.exit(0);
}

main();
