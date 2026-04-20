import fs from "node:fs";
import path from "node:path";

type ForgeRecordCheck = {
  recordPath: string;
  candidateId: string | null;
  currentStatus: string | null;
  ok: boolean;
  missingFields: string[];
  brokenLinks: string[];
  requiredGatesCount: number;
};

function listMarkdownFiles(dirPath: string) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dirPath, entry.name));
}

function listForgeRecordFiles(recordsDir: string) {
  return listMarkdownFiles(recordsDir).filter(
    (filePath) =>
      !filePath.endsWith("README.md") && filePath.endsWith("-forge-record.md"),
  );
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getFieldValue(content: string, label: string) {
  const pattern = new RegExp(`-\\s*${escapeRegex(label)}:\\s*(.*)$`, "im");
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function extractBacklogCandidateIds(backlogContent: string) {
  const ids = new Set<string>();
  const matches = backlogContent.matchAll(/^\|\s*`([^`]+)`\s*\|/gm);
  for (const match of matches) {
    const id = match[1]?.trim();
    if (id) ids.add(id);
  }
  return ids;
}

function main() {
  const workspaceRoot = process.cwd();
  const directiveRoot = path.resolve(workspaceRoot, "..", "directive-workspace");
  const recordsDir = path.join(directiveRoot, "forge", "records");
  const recordFiles = listForgeRecordFiles(recordsDir);
  const promotionRecordsDir = path.join(directiveRoot, "forge", "promotion-records");

  const requiredNonEmptyFields = [
    "Candidate id",
    "Candidate name",
    "Forge record date",
    "Origin path",
    "Linked follow-up record",
    "Runtime objective",
    "Proposed host",
    "Proposed runtime surface",
    "Execution slice",
    "Required proof",
    "Risks",
    "Rollback",
    "Current status",
    "Next decision point",
  ];

  const checks: ForgeRecordCheck[] = recordFiles.map((recordPath) => {
    const content = readText(recordPath);
    const missingFields: string[] = [];
    const brokenLinks: string[] = [];
    const candidateId = getFieldValue(content, "Candidate id");
    const currentStatus = getFieldValue(content, "Current status");

    for (const field of requiredNonEmptyFields) {
      const value = getFieldValue(content, field);
      if (!value) missingFields.push(field);
    }

    const requiredGatesMatches = content.match(/`npm run [^`]+`/g) ?? [];
    const requiredGatesCount = requiredGatesMatches.length;
    if (requiredGatesCount === 0) {
      missingFields.push("Required gates");
    }

    const originPath = getFieldValue(content, "Origin path");
    if (originPath && !originPath.startsWith("`")) {
      brokenLinks.push("Origin path must be wrapped in backticks");
    }
    if (originPath) {
      const resolved = originPath.replaceAll("`", "");
      if (!fs.existsSync(resolved)) {
        brokenLinks.push(`Origin path does not exist: ${resolved}`);
      }
    }

    const followUpPath = getFieldValue(content, "Linked follow-up record");
    if (followUpPath && !followUpPath.startsWith("`")) {
      brokenLinks.push("Linked follow-up record must be wrapped in backticks");
    }
    if (followUpPath) {
      const resolved = followUpPath.replaceAll("`", "");
      if (!fs.existsSync(resolved)) {
        brokenLinks.push(`Linked follow-up record does not exist: ${resolved}`);
      }
    }

    const ok = missingFields.length === 0 && brokenLinks.length === 0;
    return {
      recordPath,
      candidateId,
      currentStatus,
      ok,
      missingFields,
      brokenLinks,
      requiredGatesCount,
    };
  });

  const backlogFiles = listMarkdownFiles(promotionRecordsDir)
    .filter((filePath) => filePath.endsWith("-forge-promotion-backlog.md"))
    .sort();
  const activeBacklogPath =
    backlogFiles.length > 0 ? backlogFiles[backlogFiles.length - 1] : null;

  const pendingCandidateIds = checks
    .filter((check) =>
      String(check.currentStatus || "").toLowerCase().includes("pending runtime slice"),
    )
    .map((check) => check.candidateId)
    .filter((id): id is string => Boolean(id));

  let backlogCheck = {
    ok: false,
    backlogPath: activeBacklogPath,
    missingCandidateIds: [] as string[],
    reason: null as string | null,
  };

  if (!activeBacklogPath) {
    backlogCheck = {
      ok: false,
      backlogPath: null,
      missingCandidateIds: pendingCandidateIds,
      reason: "missing forge promotion backlog file",
    };
  } else {
    const backlogContent = readText(activeBacklogPath);
    const backlogIds = extractBacklogCandidateIds(backlogContent);
    const missingCandidateIds = pendingCandidateIds.filter((id) => !backlogIds.has(id));
    backlogCheck = {
      ok: missingCandidateIds.length === 0,
      backlogPath: activeBacklogPath,
      missingCandidateIds,
      reason:
        missingCandidateIds.length > 0
          ? "pending Forge records missing from promotion backlog"
          : null,
    };
  }

  const output = {
    ok: checks.every((check) => check.ok) && backlogCheck.ok,
    metrics: {
      totalForgeRecords: checks.length,
      failedForgeRecords: checks.filter((check) => !check.ok).length,
      pendingForgeRecords: pendingCandidateIds.length,
      backlogCoverageMissing: backlogCheck.missingCandidateIds.length,
    },
    backlogCheck,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.ok) process.exit(1);
}

main();
