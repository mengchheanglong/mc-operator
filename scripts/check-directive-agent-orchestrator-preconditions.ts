import fs from "node:fs";
import path from "node:path";
import { getForgeSourcePackCatalogEntry, getForgeSourcePackPath } from "@/server/paths/directive-source-packs";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

function readIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function includesAll(content: string, required: string[]) {
  const missing = required.filter((term) => !content.includes(term));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function main() {
  const workspaceRoot = process.cwd();
  const directiveRoot = path.resolve(workspaceRoot, "..", "directive-workspace");
  const packRoot = getForgeSourcePackPath("agent-orchestrator");
  const cliEntryPath = path.join(packRoot, "packages", "cli", "dist", "index.js");
  const readyMarkerPath = path.join(packRoot, "SOURCE_PACK_READY.md");
  const followUpPath = path.join(
    directiveRoot,
    "forge",
    "follow-up",
    "2026-03-20-agent-orchestrator-runtime-followup.md",
  );
  const correctionRecordPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-agent-orchestrator-precondition-correction.md",
  );
  const preconditionProofPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-agent-orchestrator-cli-precondition-proof.md",
  );
  const promotionRecordPath = path.join(
    directiveRoot,
    "forge",
    "promotion-records",
    "2026-03-21-agent-orchestrator-promotion-record.md",
  );
  const registryEntryPath = path.join(
    directiveRoot,
    "forge",
    "registry",
    "2026-03-21-agent-orchestrator-registry-entry.md",
  );
  const sourcePackEntry = getForgeSourcePackCatalogEntry("agent-orchestrator");
  const followUp = readIfExists(followUpPath);
  const correctionRecord = readIfExists(correctionRecordPath);
  const preconditionProof = readIfExists(preconditionProofPath);

  const checks: Check[] = [
    {
      id: "agent-orchestrator-follow-up-exists",
      ok: Boolean(followUp),
      reason: followUp ? null : `missing follow-up note: ${followUpPath}`,
    },
    {
      id: "agent-orchestrator-correction-record-exists",
      ok: Boolean(correctionRecord),
      reason: correctionRecord ? null : `missing correction record: ${correctionRecordPath}`,
    },
    {
      id: "agent-orchestrator-ready-marker-exists",
      ok: fs.existsSync(readyMarkerPath),
      reason: fs.existsSync(readyMarkerPath) ? null : `missing ready marker: ${readyMarkerPath}`,
    },
    {
      id: "agent-orchestrator-precondition-proof-exists",
      ok: Boolean(preconditionProof),
      reason: preconditionProof ? null : `missing precondition proof: ${preconditionProofPath}`,
    },
    {
      id: "agent-orchestrator-catalog-blocked",
      ok:
        sourcePackEntry?.classification === "follow_up_only" &&
        sourcePackEntry.activationMode === "manual_follow_up",
      reason:
        sourcePackEntry?.classification === "follow_up_only" &&
        sourcePackEntry.activationMode === "manual_follow_up"
          ? null
          : `unexpected source-pack entry: ${JSON.stringify(sourcePackEntry)}`,
    },
    {
      id: "agent-orchestrator-no-promotion-record-while-blocked",
      ok: !fs.existsSync(promotionRecordPath),
      reason: fs.existsSync(promotionRecordPath)
        ? `blocked pack should not have promotion record: ${promotionRecordPath}`
        : null,
    },
    {
      id: "agent-orchestrator-no-registry-entry-while-blocked",
      ok: !fs.existsSync(registryEntryPath),
      reason: fs.existsSync(registryEntryPath)
        ? `blocked pack should not have registry entry: ${registryEntryPath}`
        : null,
    },
  ];

  if (followUp) {
    const required = includesAll(followUp, [
      "Status: active",
      "packages/cli/dist/index.js",
      "follow_up_only",
    ]);
    checks.push({
      id: "agent-orchestrator-follow-up-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing follow-up terms: ${required.missing.join(", ")}`,
    });
  }

  if (correctionRecord) {
    const required = includesAll(correctionRecord, [
      "classification = follow_up_only",
      "activationMode = manual_follow_up",
      "packages/cli/dist/index.js",
      "npm run check:directive-agent-orchestrator-preconditions",
    ]);
    checks.push({
      id: "agent-orchestrator-correction-record-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing correction-record terms: ${required.missing.join(", ")}`,
    });
  }

  if (preconditionProof) {
    const required = includesAll(preconditionProof, [
      "pnpm install --ignore-scripts --frozen-lockfile",
      "pnpm --filter @composio/ao-cli build",
      "pnpm --filter @composio/ao-cli exec node dist/index.js --help",
      "Result: PASS",
      "classification = follow_up_only",
      "activationMode = manual_follow_up",
    ]);
    checks.push({
      id: "agent-orchestrator-precondition-proof-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing precondition-proof terms: ${required.missing.join(", ")}`,
    });
  }

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failed.length > 0) process.exit(1);
}

main();
