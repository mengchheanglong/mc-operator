// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/integration-artifact-generator.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import fs from "node:fs";
import path from "node:path";

export type ExperimentExtraction = {
  candidateId: string;
  candidateName: string;
  objective: string;
  validationGates: string[];
  requiredOutputArtifacts: string[];
  rollbackSummary: string;
};

export type GeneratedIntegrationArtifacts = {
  integrationContractArtifact: string;
  proofChecklistArtifact: string;
  extraction: ExperimentExtraction;
};

function normalizeWhitespace(input: string) {
  return input.replace(/\r\n/g, "\n");
}

function unique(items: string[]) {
  return [...new Set(items)];
}

function toSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function section(content: string, title: string) {
  const lines = normalizeWhitespace(content).split("\n");
  const headingPattern = new RegExp(
    `^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
    "i",
  );
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start < 0) return "";

  const collected: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line.trim())) break;
    collected.push(line);
  }
  return collected.join("\n").trim();
}

function field(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^${escaped}:\\s*(.+)$`, "im"));
  if (!match) return "";
  return String(match[1] || "").replace(/`/g, "").trim();
}

function parseBacktickItems(content: string) {
  return unique(
    [...content.matchAll(/`([^`]+)`/g)]
      .map((match) => String(match[1] || "").trim())
      .filter(Boolean),
  );
}

function parseBulletLines(content: string) {
  return unique(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).replace(/`/g, "").trim())
      .filter(Boolean),
  );
}

export function extractFromExperimentArtifact(markdown: string): ExperimentExtraction {
  const content = normalizeWhitespace(markdown);
  const candidateId = field(content, "Candidate id") || "unknown-candidate";
  const candidateName = field(content, "Candidate name") || candidateId;
  const objective = section(content, "Objective").split(/\r?\n/)[0]?.trim() || "n/a";

  const validationSection = section(content, "Validation Gates");
  const validationGates = unique(
    parseBacktickItems(validationSection).filter((item) => item.startsWith("npm run ")),
  );

  const outputSection =
    section(content, "Required Output Artifacts") ||
    section(content, "Required Output Artifact");
  const requiredOutputArtifacts = unique(parseBacktickItems(outputSection));

  const rollbackSection =
    section(content, "Rollback / No-op") ||
    section(content, "Rollback / No-ops") ||
    section(content, "Rollback / No-Op") ||
    section(content, "Rollback");
  const rollbackBullets = parseBulletLines(rollbackSection);
  const rollbackSummary =
    rollbackBullets.length > 0
      ? rollbackBullets.join("; ")
      : rollbackSection.split(/\r?\n/)[0]?.trim() || "n/a";

  return {
    candidateId,
    candidateName,
    objective,
    validationGates,
    requiredOutputArtifacts,
    rollbackSummary,
  };
}

export function generateIntegrationArtifacts(input: {
  experimentArtifactPath: string;
  experimentArtifactContent: string;
  adoptionTarget?: string;
  integrationMode?: "reimplement" | "adapt" | "wrap";
  owner?: string;
}): GeneratedIntegrationArtifacts {
  const extraction = extractFromExperimentArtifact(input.experimentArtifactContent);
  const adoptionTarget = input.adoptionTarget || "Directive Architecture";
  const integrationMode = input.integrationMode || "adapt";
  const owner = input.owner || "operator";
  const now = new Date().toISOString();

  const requiredGates =
    extraction.validationGates.length > 0
      ? extraction.validationGates
      : ["npm run check:directive-v0", "npm run check:ops-stack"];
  const requiredArtifacts =
    extraction.requiredOutputArtifacts.length > 0
      ? extraction.requiredOutputArtifacts
      : ["n/a"];

  const integrationContractArtifact = [
    "# Integration Contract Artifact",
    "",
    "- Artifact type: `IntegrationContractArtifact`",
    `- capability_id: ${extraction.candidateId}`,
    `- capability_name: ${extraction.candidateName}`,
    `- generated_at: ${now}`,
    `- source_experiment_design_artifact: \`${input.experimentArtifactPath}\``,
    `- adoption_target: ${adoptionTarget}`,
    `- integration_mode: ${integrationMode}`,
    `- owner: ${owner}`,
    "- required_gates:",
    ...requiredGates.map((gate) => `  - \`${gate}\``),
    "- expected_output_artifacts:",
    ...requiredArtifacts.map((artifact) => `  - \`${artifact}\``),
    `- objective_summary: ${extraction.objective}`,
    `- rollback_plan: ${extraction.rollbackSummary}`,
    "- status: draft-generated",
  ].join("\n");

  const proofChecklistArtifact = [
    "# Proof Checklist Artifact",
    "",
    "- Artifact type: `ProofChecklistArtifact`",
    `- capability_id: ${extraction.candidateId}`,
    `- capability_name: ${extraction.candidateName}`,
    `- generated_at: ${now}`,
    `- source_experiment_design_artifact: \`${input.experimentArtifactPath}\``,
    "- required_proof_items:",
    ...requiredArtifacts.map((artifact) => `  - \`${artifact}\``),
    "  - `Gate snapshot JSON`",
    "  - `Rollback verification note`",
    "- validation_commands:",
    ...requiredGates.map((gate) => `  - \`${gate}\``),
    "- gate_snapshot: pending",
    "- pass_fail_summary: pending",
    "- rollback_verification: pending",
    "- status: draft-generated",
  ].join("\n");

  return {
    integrationContractArtifact,
    proofChecklistArtifact,
    extraction,
  };
}

export function writeGeneratedIntegrationArtifacts(input: {
  outputDir: string;
  date: string;
  candidateId: string;
  integrationContractArtifact: string;
  proofChecklistArtifact: string;
}) {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const slug = toSlug(input.candidateId || "candidate");
  const integrationPath = path.resolve(
    input.outputDir,
    `${input.date}-${slug}-integration-contract-artifact.md`,
  );
  const proofPath = path.resolve(
    input.outputDir,
    `${input.date}-${slug}-proof-checklist-artifact.md`,
  );

  fs.writeFileSync(integrationPath, input.integrationContractArtifact, "utf8");
  fs.writeFileSync(proofPath, input.proofChecklistArtifact, "utf8");

  return {
    integrationPath,
    proofPath,
  };
}
