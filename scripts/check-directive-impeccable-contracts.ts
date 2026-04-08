import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getArchitectureReviewRequiredChecks,
  resolveArchitectureReview,
} from "../src/lib/directive-workspace/architecture-review-resolution";

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
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const contractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "architecture-review-guardrails.md",
  );
  const checklistPath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "architecture-review-checklist.md",
  );
  const policyPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-21-impeccable-review-checklist-policy.md",
  );
  const adoptedPath = path.join(
    directiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-21-impeccable-wave-02-adopted.md",
  );
  const executableReviewPath = path.join(
    directiveRoot,
    "shared",
    "lib",
    "architecture-review-resolution.ts",
  );

  const checks: Check[] = [];
  const contract = readIfExists(contractPath);
  const checklist = readIfExists(checklistPath);
  const policy = readIfExists(policyPath);
  const adopted = readIfExists(adoptedPath);

  checks.push({
    id: "review-guardrail-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "review-checklist-template-exists",
    ok: Boolean(checklist),
    reason: checklist ? null : `missing checklist template: ${checklistPath}`,
  });
  checks.push({
    id: "impeccable-policy-exists",
    ok: Boolean(policy),
    reason: policy ? null : `missing policy note: ${policyPath}`,
  });
  checks.push({
    id: "impeccable-adopted-note-exists",
    ok: Boolean(adopted),
    reason: adopted ? null : `missing adopted note: ${adoptedPath}`,
  });
  checks.push({
    id: "architecture-review-resolution-lib-exists",
    ok: fs.existsSync(executableReviewPath),
    reason: fs.existsSync(executableReviewPath)
      ? null
      : `missing executable review lib: ${executableReviewPath}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      "architecture_review_guardrails/v1",
      "signal_over_noise",
      "explicit_state_visibility",
      "safe_defaults",
      "scope_discipline",
      "operational_traceability",
      "state_visibility_check",
      "rollback_check",
      "scope_isolation_check",
      "validation_link_check",
      "ownership_boundary_check",
    ]);
    checks.push({
      id: "review-guardrail-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (checklist) {
    const required = includesAll(checklist, [
      "architecture_review_guardrails/v1",
      "Signal over noise:",
      "Explicit state visibility:",
      "Safe defaults:",
      "Scope discipline:",
      "Operational traceability:",
      "Anti-Pattern Scan",
      "Rollback or no-op:",
    ]);
    checks.push({
      id: "review-checklist-template-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing checklist terms: ${required.missing.join(", ")}`,
    });
  }

  if (policy) {
    const required = includesAll(policy, [
      "check:directive-impeccable-contracts",
      "check:directive-workflow-doctrine",
      "check:ops-stack",
      "named guardrail vocabulary",
      "explicit anti-pattern scan",
    ]);
    checks.push({
      id: "impeccable-policy-validation-hooks",
      ok: required.ok,
      reason: required.ok ? null : `missing policy terms: ${required.missing.join(", ")}`,
    });
  }

  if (adopted) {
    const required = includesAll(adopted, [
      "product_materialized",
      "architecture-review-guardrails.md",
      "architecture-review-checklist.md",
      "check:directive-impeccable-contracts",
    ]);
    checks.push({
      id: "impeccable-adopted-closure-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing adopted-note terms: ${required.missing.join(", ")}`,
    });
  }

  try {
    const requiredChecks = getArchitectureReviewRequiredChecks();
    checks.push({
      id: "architecture-review-required-check-count",
      ok: requiredChecks.length === 7,
      reason:
        requiredChecks.length === 7
          ? null
          : `expected 7 executable Architecture review checks, got ${requiredChecks.length}`,
    });

    const strongReview = resolveArchitectureReview({
      candidateId: "strong-review",
      checks: {
        state_visibility_check: "pass",
        rollback_check: "pass",
        scope_isolation_check: "pass",
        validation_link_check: "pass",
        ownership_boundary_check: "pass",
        packet_consumption_check: "pass",
        artifact_evidence_continuity_check: "pass",
      },
    });
    assert.equal(strongReview.reviewResult, "approved");
    assert.equal(strongReview.reviewScore, 5);
    assert.equal(strongReview.lifecycleFeedback.outcome, "promote_to_decision");
    assert.equal(strongReview.transitionRequest.to, "decided");
    assert.equal(strongReview.transitionRequest.role, "decision_owner");
    checks.push({
      id: "architecture-review-strong-case-promotes",
      ok: true,
      reason: null,
    });

    const followUpReview = resolveArchitectureReview({
      candidateId: "follow-up-review",
      checks: {
        state_visibility_check: "pass",
        rollback_check: "pass",
        scope_isolation_check: "pass",
        validation_link_check: "pass",
        ownership_boundary_check: "pass",
        packet_consumption_check: "fail",
        artifact_evidence_continuity_check: "warning",
      },
      antiPatterns: {
        ignored_reusable_packet_inputs: true,
      },
    });
    assert.equal(followUpReview.reviewResult, "approved");
    assert.equal(followUpReview.reviewScore, 3);
    assert.equal(followUpReview.lifecycleFeedback.outcome, "accept_with_follow_up");
    assert.equal(followUpReview.lifecycleFeedback.shouldRecordRecoveryFollowUp, true);
    checks.push({
      id: "architecture-review-follow-up-case-records-recovery",
      ok: true,
      reason: null,
    });

    const blockedReview = resolveArchitectureReview({
      candidateId: "blocked-review",
      checks: {
        state_visibility_check: "pass",
        rollback_check: "pass",
        scope_isolation_check: "pass",
        validation_link_check: "fail",
        ownership_boundary_check: "fail",
        packet_consumption_check: "warning",
        artifact_evidence_continuity_check: "pass",
      },
      blockedReason: "ownership boundary and validation method are unresolved",
    });
    assert.equal(blockedReview.reviewResult, "rejected");
    assert.equal(blockedReview.lifecycleFeedback.outcome, "blocked_recovery");
    assert.equal(blockedReview.transitionRequest.to, "blocked");
    assert.ok(blockedReview.lifecycleFeedback.recoveryPlan);
    checks.push({
      id: "architecture-review-blocked-case-emits-recovery-plan",
      ok: true,
      reason: null,
    });

    const resumeReview = resolveArchitectureReview({
      candidateId: "resume-review",
      recoveryOwnerAssigned: true,
      checks: {
        state_visibility_check: "pass",
        rollback_check: "pass",
        scope_isolation_check: "fail",
        validation_link_check: "pass",
        ownership_boundary_check: "pass",
        packet_consumption_check: "fail",
        artifact_evidence_continuity_check: "fail",
      },
      antiPatterns: {
        ignored_reusable_packet_inputs: true,
        unbounded_rewrite_pressure: true,
      },
    });
    assert.equal(resumeReview.reviewResult, "rejected");
    assert.equal(resumeReview.lifecycleFeedback.outcome, "resume_experiment");
    assert.equal(resumeReview.transitionRequest.to, "experimenting");
    assert.equal(resumeReview.transitionRequest.role, "planner");
    checks.push({
      id: "architecture-review-resume-case-reopens-experiment",
      ok: true,
      reason: null,
    });
  } catch (error) {
    checks.push({
      id: "architecture-review-executable-lane-smoke",
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
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
  if (!output.ok) process.exit(1);
}

main();
