import fs from "node:fs";
import path from "node:path";

type ContractCheck = {
  kind: "monitor-trigger" | "forge-reentry";
  contractPath: string;
  candidateId: string | null;
  linkedRecordPath: string | null;
  ok: boolean;
  reason: string | null;
};

type RecordCheck = {
  kind: "monitor-record" | "forge-follow-up-record";
  recordPath: string;
  candidateId: string | null;
  ok: boolean;
  missingFields: string[];
};

function listMarkdownFiles(dirPath: string) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dirPath, entry.name));
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCandidateId(content: string) {
  const match = content.match(/Candidate id:\s*`([^`]+)`/i);
  return match ? match[1].trim() : null;
}

function hasField(content: string, label: string) {
  const pattern = new RegExp(`-\\s*${escapeRegex(label)}:\\s*(.*)$`, "im");
  return pattern.test(content);
}

function hasNonEmptyField(content: string, label: string) {
  const pattern = new RegExp(`-\\s*${escapeRegex(label)}:\\s*(.*)$`, "im");
  const match = content.match(pattern);
  return Boolean(match && match[1].trim().length > 0);
}

function checkMonitorRecordShape(recordPath: string): RecordCheck {
  const content = readText(recordPath);
  const missingFields: string[] = [];

  const requiredNonEmpty = [
    "Candidate id",
    "Candidate name",
    "Monitor date",
    "Current decision state",
    "Why kept in monitor",
    "Trigger matrix path",
    "Review cadence",
    "Last review result",
    "Next review date",
    "No-op rule",
    "Linked intake record",
    "Linked triage record",
    "Linked routing record",
  ];
  const requiredPresence = ["Promotion trigger conditions"];

  for (const field of requiredNonEmpty) {
    if (!hasNonEmptyField(content, field)) {
      missingFields.push(field);
    }
  }
  for (const field of requiredPresence) {
    if (!hasField(content, field)) {
      missingFields.push(field);
    }
  }

  return {
    kind: "monitor-record",
    recordPath,
    candidateId: extractCandidateId(content),
    ok: missingFields.length === 0,
    missingFields,
  };
}

function checkForgeFollowUpRecordShape(recordPath: string): RecordCheck {
  const content = readText(recordPath);
  const missingFields: string[] = [];

  const requiredNonEmpty = [
    "Candidate id",
    "Candidate name",
    "Follow-up date",
    "Current decision state",
    "Origin track",
    "Runtime value to operationalize",
    "Proposed host",
    "Proposed integration mode",
    "Promotion contract path",
    "Re-entry contract path (if deferred)",
    "Rollback",
    "No-op path",
    "Review cadence",
    "Current status",
  ];
  const requiredPresence = [
    "Re-entry preconditions (checklist)",
    "Required proof",
    "Required gates",
    "Trial scope limit (if experimenting)",
    "Risks",
  ];

  for (const field of requiredNonEmpty) {
    if (!hasNonEmptyField(content, field)) {
      missingFields.push(field);
    }
  }
  for (const field of requiredPresence) {
    if (!hasField(content, field)) {
      missingFields.push(field);
    }
  }

  return {
    kind: "forge-follow-up-record",
    recordPath,
    candidateId: extractCandidateId(content),
    ok: missingFields.length === 0,
    missingFields,
  };
}

function main() {
  const workspaceRoot = process.cwd();
  const directiveRoot = path.resolve(workspaceRoot, "..", "directive-workspace");
  const discoveryMonitorDir = path.join(directiveRoot, "discovery", "monitor");
  const forgeFollowUpDir = path.join(directiveRoot, "forge", "follow-up");

  const monitorFiles = listMarkdownFiles(discoveryMonitorDir);
  const forgeFiles = listMarkdownFiles(forgeFollowUpDir);

  const monitorTriggerFiles = monitorFiles.filter((file) =>
    file.endsWith("-monitor-trigger-matrix.md"),
  );
  const monitorRecordFiles = monitorFiles.filter((file) =>
    file.endsWith("-monitor-record.md"),
  );
  const forgeReentryFiles = forgeFiles.filter((file) =>
    file.endsWith("-reentry-contract.md"),
  );
  const forgeRecordFiles = forgeFiles.filter((file) =>
    file.endsWith("-forge-follow-up-record.md"),
  );

  const monitorRecordByCandidate = new Map<string, string>();
  for (const filePath of monitorRecordFiles) {
    const candidateId = extractCandidateId(readText(filePath));
    if (candidateId) monitorRecordByCandidate.set(candidateId, filePath);
  }

  const forgeRecordByCandidate = new Map<string, string>();
  for (const filePath of forgeRecordFiles) {
    const candidateId = extractCandidateId(readText(filePath));
    if (candidateId) forgeRecordByCandidate.set(candidateId, filePath);
  }

  const contractChecks: ContractCheck[] = [];

  for (const contractPath of monitorTriggerFiles) {
    const contractContent = readText(contractPath);
    const candidateId = extractCandidateId(contractContent);
    const linkedRecordPath = candidateId
      ? (monitorRecordByCandidate.get(candidateId) ?? null)
      : null;

    if (!candidateId) {
      contractChecks.push({
        kind: "monitor-trigger",
        contractPath,
        candidateId: null,
        linkedRecordPath: null,
        ok: false,
        reason: "missing candidate id",
      });
      continue;
    }

    if (!linkedRecordPath) {
      contractChecks.push({
        kind: "monitor-trigger",
        contractPath,
        candidateId,
        linkedRecordPath: null,
        ok: false,
        reason: "missing linked monitor record",
      });
      continue;
    }

    const recordText = readText(linkedRecordPath);
    const recordLinksContract = recordText.includes(contractPath);
    contractChecks.push({
      kind: "monitor-trigger",
      contractPath,
      candidateId,
      linkedRecordPath,
      ok: recordLinksContract,
      reason: recordLinksContract ? null : "monitor record does not reference trigger matrix",
    });
  }

  for (const contractPath of forgeReentryFiles) {
    const contractContent = readText(contractPath);
    const candidateId = extractCandidateId(contractContent);
    const linkedRecordPath = candidateId ? (forgeRecordByCandidate.get(candidateId) ?? null) : null;

    if (!candidateId) {
      contractChecks.push({
        kind: "forge-reentry",
        contractPath,
        candidateId: null,
        linkedRecordPath: null,
        ok: false,
        reason: "missing candidate id",
      });
      continue;
    }

    if (!linkedRecordPath) {
      contractChecks.push({
        kind: "forge-reentry",
        contractPath,
        candidateId,
        linkedRecordPath: null,
        ok: false,
        reason: "missing linked forge follow-up record",
      });
      continue;
    }

    const recordText = readText(linkedRecordPath);
    const recordLinksContract = recordText.includes(contractPath);
    contractChecks.push({
      kind: "forge-reentry",
      contractPath,
      candidateId,
      linkedRecordPath,
      ok: recordLinksContract,
      reason: recordLinksContract ? null : "forge follow-up record does not reference re-entry contract",
    });
  }

  const monitorRecordChecks = monitorRecordFiles.map(checkMonitorRecordShape);
  const forgeRecordChecks = forgeRecordFiles.map(checkForgeFollowUpRecordShape);
  const recordChecks = [...monitorRecordChecks, ...forgeRecordChecks];

  const ok =
    contractChecks.every((check) => check.ok) &&
    recordChecks.every((check) => check.ok);

  const output = {
    ok,
    metrics: {
      monitorTriggerContracts: monitorTriggerFiles.length,
      monitorRecords: monitorRecordFiles.length,
      forgeReentryContracts: forgeReentryFiles.length,
      forgeFollowUpRecords: forgeRecordFiles.length,
      failedContractChecks: contractChecks.filter((check) => !check.ok).length,
      failedRecordChecks: recordChecks.filter((check) => !check.ok).length,
    },
    contractChecks,
    recordChecks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
