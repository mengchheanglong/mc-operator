import fs from "node:fs";
import path from "node:path";

type Check = {
  candidateId: string;
  nextReviewDate: string | null;
  daysOverdue: number;
  ok: boolean;
};

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const monitorDir = path.join(directiveRoot, "discovery", "monitor");

  if (!fs.existsSync(monitorDir)) {
    console.log("PASS: monitor directory does not exist (nothing to check)");
    process.exit(0);
  }

  const files = fs
    .readdirSync(monitorDir)
    .filter((f) => f.endsWith(".md") && f !== "README.md");

  if (files.length === 0) {
    console.log("PASS: no monitor records found");
    process.exit(0);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checks: Check[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(monitorDir, file), "utf8");

    // Extract candidate id
    const candidateIdMatch = content.match(/^- Candidate id:\s*`?([^`\n]+)`?/m);
    const candidateId = candidateIdMatch?.[1]?.trim() ?? file;

    // Extract next review date
    const reviewDateMatch = content.match(
      /^- Next review date:\s*`?([^`\n]+)`?/m,
    );
    const nextReviewDateStr = reviewDateMatch?.[1]?.trim() ?? null;

    if (!nextReviewDateStr) {
      // Files without a Next review date field are not monitor records (e.g., trigger matrices)
      continue;
    }

    const nextReviewDate = new Date(nextReviewDateStr);
    if (isNaN(nextReviewDate.getTime())) {
      checks.push({
        candidateId,
        nextReviewDate: nextReviewDateStr,
        daysOverdue: 0,
        ok: false,
      });
      console.log(
        `WARN: ${candidateId} — unparseable review date: ${nextReviewDateStr}`,
      );
      continue;
    }

    nextReviewDate.setHours(0, 0, 0, 0);
    const diffMs = today.getTime() - nextReviewDate.getTime();
    const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    checks.push({
      candidateId,
      nextReviewDate: nextReviewDateStr,
      daysOverdue: Math.max(0, daysOverdue),
      ok: daysOverdue <= 0,
    });
  }

  if (checks.length === 0) {
    console.log("PASS: no monitor records with review dates found");
    process.exit(0);
  }

  const overdue = checks.filter((c) => !c.ok);
  const current = checks.filter((c) => c.ok);

  console.log(
    `Discovery monitor review cadence: ${current.length} current, ${overdue.length} overdue\n`,
  );

  for (const c of current) {
    console.log(`  OK: ${c.candidateId} — next review: ${c.nextReviewDate}`);
  }

  for (const c of overdue) {
    console.log(
      `  OVERDUE: ${c.candidateId} — due ${c.nextReviewDate}, ${c.daysOverdue} day(s) overdue`,
    );
  }

  if (overdue.length > 0) {
    console.log(
      `\nFAIL: ${overdue.length} monitor item(s) past review date`,
    );
    process.exit(1);
  }

  console.log("\nPASS: all monitor items within review cadence");
  process.exit(0);
}

main();
