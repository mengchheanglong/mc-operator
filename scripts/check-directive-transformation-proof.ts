import fs from "node:fs";
import path from "node:path";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const forgeRecordsDir = path.join(directiveRoot, "forge", "records");

  if (!fs.existsSync(forgeRecordsDir)) {
    console.log("PASS: forge/records directory does not exist (nothing to check)");
    process.exit(0);
  }

  const allMdFiles = fs
    .readdirSync(forgeRecordsDir)
    .filter((f) => f.endsWith(".md"));

  // Detect transformation records by content (Transformation type: field),
  // not by filename — a record named "speed-improvement.md" is still a
  // transformation record if it contains the transformation type marker.
  const files = allMdFiles.filter((f) => {
    const content = fs.readFileSync(path.join(forgeRecordsDir, f), "utf8");
    return /^- Transformation type:/m.test(content);
  });

  if (files.length === 0) {
    console.log(
      "PASS: no transformation records found in forge/records/ (vacuous pass)",
    );
    process.exit(0);
  }

  const checks: Check[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(forgeRecordsDir, file), "utf8");
    const id = file;

    // Check for required transformation proof fields
    const hasPreservationClaim =
      content.includes("Preservation claim:") &&
      !content.match(/Preservation claim:\s*\[/);
    const hasBaselineMetric =
      content.includes("Measured baseline:") ||
      content.includes("baseline_measurement");
    const hasResultMetric =
      content.includes("Expected improvement:") ||
      content.includes("result_measurement") ||
      content.includes("Metric improvement measured:");
    const hasRollback =
      content.includes("Rollback path:") ||
      content.includes("rollback_verification");

    const missing: string[] = [];
    if (!hasPreservationClaim) missing.push("preservation_claim");
    if (!hasBaselineMetric) missing.push("baseline_measurement");
    if (!hasResultMetric) missing.push("result_measurement");
    if (!hasRollback) missing.push("rollback_verification");

    checks.push({
      id,
      ok: missing.length === 0,
      reason:
        missing.length > 0 ? `missing fields: ${missing.join(", ")}` : null,
    });
  }

  const passed = checks.filter((c) => c.ok);
  const failed = checks.filter((c) => !c.ok);

  console.log(
    `Transformation proof check: ${passed.length} passed, ${failed.length} failed\n`,
  );

  for (const c of passed) {
    console.log(`  OK: ${c.id}`);
  }

  for (const c of failed) {
    console.log(`  FAIL: ${c.id} — ${c.reason}`);
  }

  if (failed.length > 0) {
    console.log(
      `\nFAIL: ${failed.length} transformation record(s) missing required proof fields`,
    );
    process.exit(1);
  }

  console.log("\nPASS: all transformation records have complete proof");
  process.exit(0);
}

main();
