import fs from "node:fs";
import path from "node:path";
import {
  parseArrayFallback,
  parseObjectFallback,
  parseStringListFallback,
} from "../src/lib/directive-workspace/structured-output-fallback";
import { buildDirectiveLifecycleArtifacts } from "../src/lib/directive-workspace/lifecycle-artifacts";

type Check = {
  id: string;
  ok: boolean;
  reason?: string;
};

function includesAll(content: string, required: string[]) {
  const missing = required.filter((value) => !content.includes(value));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function checkParserBehavior() {
  const checks: Check[] = [];

  const fencedObject = parseObjectFallback(
    "```json\n{\"source_urls\": [\"https://a.test\"], \"quality_signals\": {\"confidence\": 0.8}}\n```",
  );
  checks.push({
    id: "parse-fenced-object",
    ok:
      Boolean(fencedObject) &&
      Array.isArray(fencedObject?.source_urls) &&
      Number((fencedObject?.quality_signals as Record<string, unknown> | undefined)?.confidence) ===
        0.8,
    reason: "failed to parse fenced JSON object",
  });

  const extractedArray = parseArrayFallback(
    "Model output:\n[{\"url\":\"https://one.test\"}, {\"url\":\"https://two.test\"}]",
  );
  checks.push({
    id: "parse-extracted-array",
    ok: Array.isArray(extractedArray) && extractedArray.length === 2,
    reason: "failed to parse extracted JSON array",
  });

  const listFallback = parseStringListFallback(
    "- [A](https://a.test)\n- https://b.test\nhttps://c.test, https://d.test",
  );
  checks.push({
    id: "parse-list-fallback",
    ok:
      listFallback.includes("https://a.test") &&
      listFallback.includes("https://b.test") &&
      listFallback.includes("https://c.test") &&
      listFallback.includes("https://d.test"),
    reason: "failed to parse markdown/csv list fallback",
  });

  const lifecycleArtifacts = buildDirectiveLifecycleArtifacts({
    capabilityId: "cap-1",
    sourceRef: "https://source.test/repo",
    evidenceSummary: "evidence",
    metadata: {
      source_urls: "```json\n[\"https://s1.test\", \"https://s2.test\"]\n```",
      visited_urls: "- https://v1.test\n- https://v2.test",
      citations:
        "```json\n[{\"url\":\"https://c1.test\",\"title\":\"C1\"},{\"url\":\"https://c2.test\"}]\n```",
      research_costs: "```json\n{\"total_usd\": 0.4, \"provider_breakdown\": {\"openai\": 0.4}}\n```",
      quality_signals: "```json\n{\"confidence\": 0.9, \"coverage\": \"high\"}\n```",
      errors: "parse warning, citation inferred",
    },
  });

  checks.push({
    id: "lifecycle-artifact-fallback-bindings",
    ok:
      lifecycleArtifacts.evaluationSupport.source_urls.length === 2 &&
      lifecycleArtifacts.evaluationSupport.visited_urls.length === 2 &&
      lifecycleArtifacts.citationSet.citations.length === 2 &&
      lifecycleArtifacts.analysisEvidence.errors.length === 2 &&
      lifecycleArtifacts.evaluationSupport.research_costs.total_usd === 0.4 &&
      Number(lifecycleArtifacts.evaluationSupport.quality_signals.confidence) === 0.9,
    reason: "lifecycle artifact fallback binding failed for noisy structured metadata",
  });

  const failed = checks.filter((check) => !check.ok);
  return {
    checks,
    failed,
  };
}

function main() {
  const workspaceRoot = process.cwd();
  const directiveRoot = path.resolve(workspaceRoot, "..", "directive-workspace");
  const sharedContractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "structured-output-fallback.md",
  );
  const architecturePolicyPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-20-structured-output-fallback-parser-policy.md",
  );

  const docChecks: Check[] = [];
  const sharedContract = fs.existsSync(sharedContractPath)
    ? fs.readFileSync(sharedContractPath, "utf8")
    : null;
  const architecturePolicy = fs.existsSync(architecturePolicyPath)
    ? fs.readFileSync(architecturePolicyPath, "utf8")
    : null;

  docChecks.push({
    id: "shared-contract-exists",
    ok: Boolean(sharedContract),
    reason: sharedContract ? undefined : `missing file: ${sharedContractPath}`,
  });
  docChecks.push({
    id: "architecture-policy-exists",
    ok: Boolean(architecturePolicy),
    reason: architecturePolicy ? undefined : `missing file: ${architecturePolicyPath}`,
  });

  if (sharedContract) {
    const sharedResult = includesAll(sharedContract, [
      "structured_output_fallback/v1",
      "strict direct JSON parse",
      "fenced JSON extraction parse",
      "trailing-comma cleanup parse",
      "typed list fallback",
      "check:directive-structured-output-fallback",
    ]);
    docChecks.push({
      id: "shared-contract-terms",
      ok: sharedResult.ok,
      reason: sharedResult.ok
        ? undefined
        : `missing terms: ${sharedResult.missing.join(", ")}`,
    });
  }

  if (architecturePolicy) {
    const policyResult = includesAll(architecturePolicy, [
      "Paper2Code Slice 2",
      "Fallback order",
      "Typed Targets",
      "Guardrails",
      "check:directive-structured-output-fallback",
    ]);
    docChecks.push({
      id: "architecture-policy-terms",
      ok: policyResult.ok,
      reason: policyResult.ok
        ? undefined
        : `missing terms: ${policyResult.missing.join(", ")}`,
    });
  }

  const parserBehavior = checkParserBehavior();
  const failedDocChecks = docChecks.filter((check) => !check.ok);
  const failedParserChecks = parserBehavior.failed;

  const output = {
    ok: failedDocChecks.length === 0 && failedParserChecks.length === 0,
    metrics: {
      totalDocChecks: docChecks.length,
      failedDocChecks: failedDocChecks.length,
      totalParserChecks: parserBehavior.checks.length,
      failedParserChecks: failedParserChecks.length,
    },
    docChecks,
    parserChecks: parserBehavior.checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.ok) process.exit(1);
}

main();
