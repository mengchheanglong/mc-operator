import fs from "node:fs";
import path from "node:path";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

type JsonSchema = {
  title?: string;
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, unknown>;
};

function readJsonSchema(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as JsonSchema;
  } catch {
    return null;
  }
}

function hasRequiredFields(schema: JsonSchema, requiredFields: string[]) {
  const required = Array.isArray(schema.required) ? schema.required : [];
  const missing = requiredFields.filter((field) => !required.includes(field));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function main() {
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const schemasDir = path.join(directiveRoot, "shared", "schemas");
  const readmePath = path.join(schemasDir, "README.md");
  const analysisPath = path.join(schemasDir, "analysis-evidence-artifact.schema.json");
  const citationPath = path.join(schemasDir, "citation-set-artifact.schema.json");
  const evaluationPath = path.join(
    schemasDir,
    "evaluation-support-artifact.schema.json",
  );

  const checks: Check[] = [];
  const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf8") : null;
  const analysis = readJsonSchema(analysisPath);
  const citation = readJsonSchema(citationPath);
  const evaluation = readJsonSchema(evaluationPath);

  checks.push({
    id: "schemas-readme-exists",
    ok: Boolean(readme),
    reason: readme ? null : `missing schema README: ${readmePath}`,
  });
  checks.push({
    id: "analysis-schema-exists",
    ok: Boolean(analysis),
    reason: analysis ? null : `missing or invalid schema: ${analysisPath}`,
  });
  checks.push({
    id: "citation-schema-exists",
    ok: Boolean(citation),
    reason: citation ? null : `missing or invalid schema: ${citationPath}`,
  });
  checks.push({
    id: "evaluation-schema-exists",
    ok: Boolean(evaluation),
    reason: evaluation ? null : `missing or invalid schema: ${evaluationPath}`,
  });

  if (readme) {
    const requiredReadmeTerms = [
      "analysis-evidence-artifact.schema.json",
      "citation-set-artifact.schema.json",
      "evaluation-support-artifact.schema.json",
    ];
    const missing = requiredReadmeTerms.filter((term) => !readme.includes(term));
    checks.push({
      id: "schemas-readme-indexes-all-artifacts",
      ok: missing.length === 0,
      reason: missing.length === 0 ? null : `missing README terms: ${missing.join(", ")}`,
    });
  }

  if (analysis) {
    const requiredCheck = hasRequiredFields(analysis, [
      "capability_id",
      "evidence_items",
      "collection_status",
      "errors",
    ]);
    const properties = analysis.properties || {};
    const collectionStatus = properties.collection_status as
      | { enum?: string[] }
      | undefined;
    const hasCollectionEnum =
      Array.isArray(collectionStatus?.enum) &&
      collectionStatus?.enum.includes("complete") &&
      collectionStatus?.enum.includes("partial") &&
      collectionStatus?.enum.includes("empty");

    checks.push({
      id: "analysis-schema-required-fields",
      ok: requiredCheck.ok,
      reason: requiredCheck.ok
        ? null
        : `analysis schema missing required fields: ${requiredCheck.missing.join(", ")}`,
    });
    checks.push({
      id: "analysis-schema-collection-status-enum",
      ok: hasCollectionEnum,
      reason: hasCollectionEnum
        ? null
        : "analysis schema missing collection_status enum complete|partial|empty",
    });
  }

  if (citation) {
    const requiredCheck = hasRequiredFields(citation, [
      "capability_id",
      "citations",
      "reference_section_markdown",
      "coverage_status",
    ]);
    const properties = citation.properties || {};
    const coverageStatus = properties.coverage_status as
      | { enum?: string[] }
      | undefined;
    const hasCoverageEnum =
      Array.isArray(coverageStatus?.enum) &&
      coverageStatus?.enum.includes("complete") &&
      coverageStatus?.enum.includes("partial") &&
      coverageStatus?.enum.includes("missing");
    const citationItems = (properties.citations as { items?: { properties?: Record<string, unknown> } } | undefined)?.items;
    const citationUrlSchema = (citationItems?.properties?.url as
      | { format?: string; pattern?: string }
      | undefined);
    const hasCitationUrlGuard =
      citationUrlSchema?.format === "uri" &&
      typeof citationUrlSchema.pattern === "string" &&
      citationUrlSchema.pattern.includes("^https?://");

    checks.push({
      id: "citation-schema-required-fields",
      ok: requiredCheck.ok,
      reason: requiredCheck.ok
        ? null
        : `citation schema missing required fields: ${requiredCheck.missing.join(", ")}`,
    });
    checks.push({
      id: "citation-schema-coverage-status-enum",
      ok: hasCoverageEnum,
      reason: hasCoverageEnum
        ? null
        : "citation schema missing coverage_status enum complete|partial|missing",
    });
    checks.push({
      id: "citation-schema-url-constraint",
      ok: hasCitationUrlGuard,
      reason: hasCitationUrlGuard
        ? null
        : "citation schema url must require uri format and ^https?:// pattern",
    });
  }

  if (evaluation) {
    const requiredCheck = hasRequiredFields(evaluation, [
      "capability_id",
      "source_urls",
      "visited_urls",
      "research_costs",
      "quality_signals",
    ]);
    const properties = evaluation.properties || {};
    const researchCosts = properties.research_costs as
      | { required?: string[] }
      | undefined;
    const hasResearchCostTotal =
      Array.isArray(researchCosts?.required) &&
      researchCosts.required.includes("total_usd");

    checks.push({
      id: "evaluation-schema-required-fields",
      ok: requiredCheck.ok,
      reason: requiredCheck.ok
        ? null
        : `evaluation schema missing required fields: ${requiredCheck.missing.join(", ")}`,
    });
    checks.push({
      id: "evaluation-schema-has-total-cost",
      ok: hasResearchCostTotal,
      reason: hasResearchCostTotal
        ? null
        : "evaluation schema missing research_costs.total_usd requirement",
    });
  }

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
      schemaFilesChecked: 3,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.ok) process.exit(1);
}

main();
