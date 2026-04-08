import fs from "node:fs";
import path from "node:path";

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

  const contractPath = path.join(directiveRoot, "shared", "contracts", "command-mediation-contract.md");
  const policyPath = path.join(directiveRoot, "shared", "contracts", "command-class-approval-policy.md");
  const followUpPath = path.join(
    directiveRoot,
    "forge",
    "follow-up",
    "2026-03-20-cli-anything-forge-follow-up-record.md",
  );
  const reentryPath = path.join(
    directiveRoot,
    "forge",
    "follow-up",
    "2026-03-20-cli-anything-reentry-contract.md",
  );
  const recordPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-22-cli-anything-reentry-preconditions-slice-01.md",
  );
  const waveShortlistPath = path.join(
    directiveRoot,
    "forge",
    "follow-up",
    "2026-03-22-forge-wave-04-shortlist.md",
  );

  const checks: Check[] = [];

  const contract = readIfExists(contractPath);
  const policy = readIfExists(policyPath);
  const followUp = readIfExists(followUpPath);
  const reentry = readIfExists(reentryPath);
  const record = readIfExists(recordPath);
  const waveShortlist = readIfExists(waveShortlistPath);

  checks.push({
    id: "cli-anything-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "cli-anything-policy-exists",
    ok: Boolean(policy),
    reason: policy ? null : `missing approval policy: ${policyPath}`,
  });
  checks.push({
    id: "cli-anything-follow-up-exists",
    ok: Boolean(followUp),
    reason: followUp ? null : `missing follow-up: ${followUpPath}`,
  });
  checks.push({
    id: "cli-anything-reentry-exists",
    ok: Boolean(reentry),
    reason: reentry ? null : `missing re-entry contract: ${reentryPath}`,
  });
  checks.push({
    id: "cli-anything-record-exists",
    ok: Boolean(record),
    reason: record ? null : `missing record: ${recordPath}`,
  });
  checks.push({
    id: "cli-anything-wave-shortlist-exists",
    ok: Boolean(waveShortlist),
    reason: waveShortlist ? null : `missing wave shortlist: ${waveShortlistPath}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      "command_mediation_contract/v1",
      "`read_only_workspace_inspect`",
      "`destructive_or_state_mutating`",
      "`network_or_external_side_effect`",
      "`privilege_or_security_sensitive`",
      "`candidate_id`",
      "`approval_mode`",
      "`request_id`",
      "`ok`",
      "`decision`",
      "`deny_reason`",
      "`rollback_hint`",
      "Hard-deny behavior",
      "only `read_only_workspace_inspect` may be considered for a future bounded experiment",
      "npm run check:directive-cli-anything-reentry",
    ]);
    checks.push({
      id: "cli-anything-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (policy) {
    const required = includesAll(policy, [
      "command_class_approval_policy/v1",
      "`read_only_workspace_inspect` | `manual_approval_required`",
      "`destructive_or_state_mutating` | `hard_deny`",
      "`network_or_external_side_effect` | `hard_deny`",
      "`privilege_or_security_sensitive` | `hard_deny`",
      "No class is pre-approved right now.",
      "Approval policy changes require a new Forge decision slice",
    ]);
    checks.push({
      id: "cli-anything-policy-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing policy terms: ${required.missing.join(", ")}`,
    });
  }

  if (followUp) {
    const required = includesAll(followUp, [
      "- [x] command-mediation contract exists",
      "- [x] command-class approval policy exists",
      "- [ ] bounded rollback/no-op test evidence exists",
      "- [x] host gates pass (`npm run check:directive-v0`, `npm run check:ops-stack`)",
      "command-mediation-contract.md",
      "command-class-approval-policy.md",
    ]);
    checks.push({
      id: "cli-anything-follow-up-checklist",
      ok: required.ok,
      reason: required.ok ? null : `missing follow-up terms: ${required.missing.join(", ")}`,
    });
  }

  if (reentry) {
    const required = includesAll(reentry, [
      "current artifact: `C:\\Users\\User\\.openclaw\\workspace\\directive-workspace\\shared\\contracts\\command-mediation-contract.md`",
      "current artifact: `C:\\Users\\User\\.openclaw\\workspace\\directive-workspace\\shared\\contracts\\command-class-approval-policy.md`",
      "current verification anchor:",
      "`npm run check:directive-cli-anything-reentry`",
    ]);
    checks.push({
      id: "cli-anything-reentry-links",
      ok: required.ok,
      reason: required.ok ? null : `missing re-entry terms: ${required.missing.join(", ")}`,
    });
  }

  if (record) {
    const required = includesAll(record, [
      "CLI-Anything Re-entry Preconditions Slice 01",
      "command-mediation contract exists",
      "command-class approval policy exists",
      "npm run check:directive-cli-anything-reentry",
      "rollback/no-op evidence still missing",
    ]);
    checks.push({
      id: "cli-anything-record-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing record terms: ${required.missing.join(", ")}`,
    });
  }

  if (waveShortlist) {
    const required = includesAll(waveShortlist, [
      "### `al-parked-cli-anything`",
      "remains deferred",
      "command-mediation contract exists",
      "approval policy exists",
      "host gate readiness exists",
      "bounded rollback/no-op evidence is still missing",
      "only reopen after the remaining rollback/no-op evidence is recorded for `read_only_workspace_inspect`",
    ]);
    checks.push({
      id: "cli-anything-wave-shortlist-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing wave-shortlist terms: ${required.missing.join(", ")}`,
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
