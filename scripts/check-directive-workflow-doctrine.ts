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
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");

  const workflowPath = path.join(directiveRoot, "knowledge", "workflow.md");
  const doctrinePath = path.join(directiveRoot, "knowledge", "doctrine.md");
  const executionPlanPath = path.join(directiveRoot, "knowledge", "execution-plan.md");
  const deliveryWorkflowPath = path.join(directiveRoot, "knowledge", "delivery-workflow.md");
  const discoveryReadmePath = path.join(directiveRoot, "discovery", "README.md");
  const forgeReadmePath = path.join(directiveRoot, "forge", "README.md");
  const architectureExplorationPath = path.join(
    directiveRoot,
    "architecture",
    "ARCHITECTURE_EXPLORATION.md",
  );
  const fastTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "discovery-fast-path-record.md",
  );
  const intakeTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "intake-record.md",
  );
  const triageTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "triage-record.md",
  );
  const routingTemplatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "routing-record.md",
  );

  const files = {
    workflow: readIfExists(workflowPath),
    doctrine: readIfExists(doctrinePath),
    executionPlan: readIfExists(executionPlanPath),
    deliveryWorkflow: readIfExists(deliveryWorkflowPath),
    discoveryReadme: readIfExists(discoveryReadmePath),
    forgeReadme: readIfExists(forgeReadmePath),
    architectureExploration: readIfExists(architectureExplorationPath),
    fastTemplate: readIfExists(fastTemplatePath),
    intakeTemplate: readIfExists(intakeTemplatePath),
    triageTemplate: readIfExists(triageTemplatePath),
    routingTemplate: readIfExists(routingTemplatePath),
  };

  const checks: Check[] = [
    {
      id: "workflow-doc-exists",
      ok: Boolean(files.workflow),
      reason: files.workflow ? null : `missing workflow doc: ${workflowPath}`,
    },
    {
      id: "fast-template-exists",
      ok: Boolean(files.fastTemplate),
      reason: files.fastTemplate ? null : `missing fast-path template: ${fastTemplatePath}`,
    },
  ];

  if (files.workflow) {
    const terms = includesAll(files.workflow, [
      "Default Fast Loop",
      "Capture",
      "Route",
      "Prove",
      "Decide",
      "Integrate + Report",
      "Default Artifact Count",
      "Escalate To Full Workflow When",
      "Validation Bundles",
    ]);
    checks.push({
      id: "workflow-doc-core-terms",
      ok: terms.ok,
      reason: terms.ok ? null : `missing workflow terms: ${terms.missing.join(", ")}`,
    });
  }

  for (const [id, content] of [
    ["doctrine", files.doctrine],
    ["execution-plan", files.executionPlan],
    ["delivery-workflow", files.deliveryWorkflow],
  ] as const) {
    checks.push({
      id: `${id}-references-workflow-doc`,
      ok: Boolean(content?.includes("knowledge\\workflow.md") || content?.includes("knowledge/workflow.md")),
      reason:
        content && (content.includes("knowledge\\workflow.md") || content.includes("knowledge/workflow.md"))
          ? null
          : `${id} does not reference knowledge/workflow.md`,
    });
  }

  if (files.discoveryReadme) {
    const discoveryTerms = includesAll(files.discoveryReadme, [
      "default to the fast path first",
      "fast-path record",
      "Split into `triage/` and `routing-log/` only",
    ]);
    checks.push({
      id: "discovery-readme-fast-path",
      ok: discoveryTerms.ok,
      reason: discoveryTerms.ok
        ? null
        : `missing Discovery fast-path terms: ${discoveryTerms.missing.join(", ")}`,
    });
  }

  if (files.forgeReadme) {
    const forgeTerms = includesAll(files.forgeReadme, [
      "Default fast path",
      "promotion record",
      "Use the smallest artifact set",
    ]);
    checks.push({
      id: "forge-readme-fast-path",
      ok: forgeTerms.ok,
      reason: forgeTerms.ok
        ? null
        : `missing Forge fast-path terms: ${forgeTerms.missing.join(", ")}`,
    });
  }

  if (files.architectureExploration) {
    const architectureTerms = includesAll(files.architectureExploration, [
      "Default fast path",
      "Validation Bundles",
      "do not default to the heaviest validation bundle",
    ]);
    checks.push({
      id: "architecture-workflow-fast-path",
      ok: architectureTerms.ok,
      reason: architectureTerms.ok
        ? null
        : `missing Architecture workflow terms: ${architectureTerms.missing.join(", ")}`,
    });
  }

  for (const [id, content] of [
    ["intake", files.intakeTemplate],
    ["triage", files.triageTemplate],
    ["routing", files.routingTemplate],
  ] as const) {
    checks.push({
      id: `${id}-template-split-only-note`,
      ok: Boolean(content?.includes("Use this only when") && content?.includes("discovery-fast-path-record.md")),
      reason:
        content && content.includes("Use this only when") && content.includes("discovery-fast-path-record.md")
          ? null
          : `${id} template does not mark split-only usage`,
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
