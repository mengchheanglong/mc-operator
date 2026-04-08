import fs from "node:fs";
import path from "node:path";
import {
  getForgePromotionProfile,
  resolveDirectiveWorkspacePath,
} from "./directive-promotion-profile-lib";

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
  const profile = getForgePromotionProfile("agent_eval_guard/v1");

  const forgeRecordPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-promptfoo-forge-record.md",
  );
  const proofPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-promptfoo-runtime-slice-01-proof.md",
  );
  const promotionPath = path.join(
    directiveRoot,
    "forge",
    "promotion-records",
    "2026-03-21-promptfoo-promotion-record.md",
  );
  const registryPath = path.join(
    directiveRoot,
    "forge",
    "registry",
    "2026-03-21-promptfoo-registry-entry.md",
  );
  const contractPath = resolveDirectiveWorkspacePath(profile.contractPath);
  const latestEvalPath = path.join(
    workspaceRoot,
    "reports",
    "evals",
    "latest.json",
  );

  const checks: Check[] = [];

  const forgeRecord = readIfExists(forgeRecordPath);
  const proof = readIfExists(proofPath);
  const promotion = readIfExists(promotionPath);
  const registry = readIfExists(registryPath);
  const contract = readIfExists(contractPath);
  const latestEval = readIfExists(latestEvalPath);

  checks.push({
    id: "promptfoo-forge-record-exists",
    ok: Boolean(forgeRecord),
    reason: forgeRecord ? null : `missing forge record: ${forgeRecordPath}`,
  });
  checks.push({
    id: "promptfoo-proof-exists",
    ok: Boolean(proof),
    reason: proof ? null : `missing proof: ${proofPath}`,
  });
  checks.push({
    id: "promptfoo-promotion-exists",
    ok: Boolean(promotion),
    reason: promotion ? null : `missing promotion record: ${promotionPath}`,
  });
  checks.push({
    id: "promptfoo-registry-exists",
    ok: Boolean(registry),
    reason: registry ? null : `missing registry entry: ${registryPath}`,
  });
  checks.push({
    id: "promptfoo-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "promptfoo-latest-eval-exists",
    ok: Boolean(latestEval),
    reason: latestEval ? null : `missing latest eval artifact: ${latestEvalPath}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      profile.id,
      profile.family,
      profile.proofShape,
      profile.primaryHostCheckCommand,
      "score >= `0.8`",
      "failure rate <= `0.15`",
      "cost USD <= `0.5`",
    ]);
    checks.push({
      id: "promptfoo-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (forgeRecord) {
    const required = includesAll(forgeRecord, [
      "agent eval harness / promotion guard lane",
      "npm run eval:agents",
      "npm run check:agent-evals",
      "npm run check:agent-eval-regression",
      "npm run check:ops-stack",
    ]);
    checks.push({
      id: "promptfoo-forge-record-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing forge-record terms: ${required.missing.join(", ")}`,
    });
  }

  if (proof) {
    const required = includesAll(proof, [
      `Quality gate profile: ${profile.id}`,
      `Promotion profile family: ${profile.family}`,
      `Proof shape: ${profile.proofShape}`,
      `Primary host checker: \`${profile.primaryHostCheckCommand}\``,
      "score: `0.857`",
      "failure rate: `0.143`",
      "cost USD: `0`",
      "`npm run eval:agents` -> PASS",
      "`npm run check:agent-evals` -> PASS",
      "`npm run check:agent-eval-regression` -> PASS",
      `\`${profile.primaryHostCheckCommand}\` -> PASS`,
    ]);
    checks.push({
      id: "promptfoo-proof-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing proof terms: ${required.missing.join(", ")}`,
    });
  }

  if (promotion) {
    const required = includesAll(promotion, [
      profile.id,
      profile.family,
      profile.proofShape,
      profile.primaryHostCheckCommand,
      "callable (bounded-eval-lane)",
      "check:agent-evals",
      "check:agent-eval-regression",
    ]);
    checks.push({
      id: "promptfoo-promotion-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing promotion terms: ${required.missing.join(", ")}`,
    });
  }

  if (registry) {
    const required = includesAll(registry, [
      "callable (bounded-eval-lane)",
      "check:ops-stack",
    ]);
    checks.push({
      id: "promptfoo-registry-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing registry terms: ${required.missing.join(", ")}`,
    });
  }

  if (latestEval) {
    const parsed = JSON.parse(latestEval) as {
      score?: number;
      failureRate?: number;
      costUsd?: number;
      total?: number;
    };

    const score = Number(parsed.score ?? 0);
    const failureRate = Number(parsed.failureRate ?? 1);
    const costUsd = Number(parsed.costUsd ?? 999);
    const total = Number(parsed.total ?? 0);

    checks.push({
      id: "promptfoo-latest-eval-thresholds",
      ok: total > 0 && score >= 0.8 && failureRate <= 0.15 && costUsd <= 0.5,
      reason:
        total > 0 && score >= 0.8 && failureRate <= 0.15 && costUsd <= 0.5
          ? null
          : `latest eval outside thresholds: total=${total}, score=${score}, failureRate=${failureRate}, costUsd=${costUsd}`,
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
