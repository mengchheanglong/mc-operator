import fs from "node:fs";
import path from "node:path";
import { buildDirectiveLifecycleArtifacts } from "../src/lib/directive-workspace/lifecycle-artifacts";

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

function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const contractPath = path.join(
    directiveRoot,
    "shared",
    "contracts",
    "citation-set-fallback.md",
  );
  const policyPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-20-citation-set-fallback-policy.md",
  );
  const schemaPath = path.join(
    directiveRoot,
    "shared",
    "schemas",
    "citation-set-artifact.schema.json",
  );

  const checks: Check[] = [];
  const contract = readIfExists(contractPath);
  const policy = readIfExists(policyPath);
  const schemaRaw = readIfExists(schemaPath);
  const schema = schemaRaw ? (JSON.parse(schemaRaw) as Record<string, unknown>) : null;

  checks.push({
    id: "citation-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "citation-policy-exists",
    ok: Boolean(policy),
    reason: policy ? null : `missing policy: ${policyPath}`,
  });
  checks.push({
    id: "citation-schema-exists",
    ok: Boolean(schema),
    reason: schema ? null : `missing schema: ${schemaPath}`,
  });

  if (contract) {
    const contractTerms = includesAll(contract, [
      "http/https",
      "URL deduplication",
      "fallback synthesis",
      "coverage_status",
      "partial",
    ]);
    checks.push({
      id: "citation-contract-terms",
      ok: contractTerms.ok,
      reason: contractTerms.ok
        ? null
        : `missing contract terms: ${contractTerms.missing.join(", ")}`,
    });
  }

  if (policy) {
    const policyTerms = includesAll(policy, [
      "check:directive-citation-contracts",
      "check:directive-v0",
      "check:ops-stack",
      "fallback synthesis from visited_urls",
    ]);
    checks.push({
      id: "citation-policy-validation-hooks",
      ok: policyTerms.ok,
      reason: policyTerms.ok
        ? null
        : `missing policy terms: ${policyTerms.missing.join(", ")}`,
    });
  }

  if (schema) {
    const properties = (schema.properties || {}) as Record<string, unknown>;
    const citations = (properties.citations || {}) as Record<string, unknown>;
    const items = (citations.items || {}) as Record<string, unknown>;
    const itemProperties = (items.properties || {}) as Record<string, unknown>;
    const urlSchema = (itemProperties.url || {}) as Record<string, unknown>;
    const hasUrlGuard =
      String(urlSchema.format || "").trim() === "uri" &&
      String(urlSchema.pattern || "").includes("^https?://");
    checks.push({
      id: "citation-schema-url-guard",
      ok: hasUrlGuard,
      reason: hasUrlGuard
        ? null
        : "citation schema must include url format=uri and pattern ^https?://",
    });
  }

  const dedupeArtifact = buildDirectiveLifecycleArtifacts({
    capabilityId: "dw-citation-contract-check-01",
    sourceRef: "https://source.test/root",
    evidenceSummary: "evidence available",
    metadata: {
      citations: [
        { url: "https://A.test/ref#fragment", title: "A title" },
        { url: "https://a.test/ref", title: "A duplicate title" },
        { source_ref: "https://b.test/path?x=1" },
        { url: "ftp://invalid.test/ref" },
        "not-a-url",
      ],
      visited_urls: ["https://a.test/ref", "https://b.test/path?x=1", "invalid-url"],
    },
  });
  const dedupeUrls = dedupeArtifact.citationSet.citations.map((citation) => citation.url);
  const dedupeOk =
    dedupeUrls.length === 2 &&
    dedupeUrls.includes("https://a.test/ref") &&
    dedupeUrls.includes("https://b.test/path?x=1");
  checks.push({
    id: "citation-runtime-dedupe-and-url-filter",
    ok: dedupeOk,
    reason: dedupeOk
      ? null
      : `expected 2 normalized citation URLs, got: ${JSON.stringify(dedupeUrls)}`,
  });
  checks.push({
    id: "citation-runtime-complete-status-with-explicit-citations",
    ok: dedupeArtifact.citationSet.coverage_status === "complete",
    reason:
      dedupeArtifact.citationSet.coverage_status === "complete"
        ? null
        : `expected complete coverage, got: ${dedupeArtifact.citationSet.coverage_status}`,
  });

  const fallbackArtifact = buildDirectiveLifecycleArtifacts({
    capabilityId: "dw-citation-contract-check-02",
    sourceRef: "https://source.test/root",
    evidenceSummary: "fallback path",
    metadata: {
      citations: "malformed citation blob",
      visited_urls: "- https://v1.test\n- invalid-url\nhttps://v2.test, https://v1.test",
    },
  });
  const fallbackUrls = fallbackArtifact.citationSet.citations.map((citation) => citation.url);
  const fallbackOk =
    fallbackArtifact.citationSet.coverage_status === "partial" &&
    fallbackUrls.length === 2 &&
    fallbackUrls.includes("https://v1.test/") &&
    fallbackUrls.includes("https://v2.test/");
  checks.push({
    id: "citation-runtime-fallback-synthesis",
    ok: fallbackOk,
    reason: fallbackOk
      ? null
      : `fallback synthesis mismatch: status=${fallbackArtifact.citationSet.coverage_status}, urls=${JSON.stringify(fallbackUrls)}`,
  });
  const references = fallbackArtifact.citationSet.reference_section_markdown;
  const singleReferenceEach =
    countOccurrences(references, "https://v1.test/") === 2 &&
    countOccurrences(references, "https://v2.test/") === 2;
  checks.push({
    id: "citation-reference-section-deduped",
    ok: singleReferenceEach,
    reason: singleReferenceEach
      ? null
      : "reference section should include each fallback URL exactly once",
  });

  const missingArtifact = buildDirectiveLifecycleArtifacts({
    capabilityId: "dw-citation-contract-check-03",
    sourceRef: "local/knowledge/ref",
    evidenceSummary: "",
    metadata: {
      citations: "",
      visited_urls: "",
    },
  });
  checks.push({
    id: "citation-runtime-missing-status",
    ok: missingArtifact.citationSet.coverage_status === "missing",
    reason:
      missingArtifact.citationSet.coverage_status === "missing"
        ? null
        : `expected missing coverage, got: ${missingArtifact.citationSet.coverage_status}`,
  });

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
