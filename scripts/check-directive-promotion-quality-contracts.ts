import fs from "node:fs";
import path from "node:path";
import {
  getForgePromotionProfile,
  resolveDirectiveWorkspacePath,
} from "./directive-promotion-profile-lib";

type PromotionQualityCheck = {
  recordPath: string;
  candidateId: string | null;
  qualityGateProfile: string | null;
  qualityGateResult: string | null;
  validationState: string | null;
  ok: boolean;
  skipped: boolean;
  missingFields: string[];
  reasons: string[];
};

type ContractCheck = {
  id: string;
  ok: boolean;
  reason?: string;
};

function listMarkdownFiles(dirPath: string) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dirPath, entry.name));
}

function listPromotionRecordFiles(dirPath: string) {
  return listMarkdownFiles(dirPath).filter(
    (filePath) =>
      !filePath.endsWith("README.md") &&
      !filePath.endsWith("-forge-promotion-backlog.md") &&
      filePath.endsWith("-promotion-record.md"),
  );
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getFieldValue(content: string, label: string) {
  const pattern = new RegExp(`-\\s*${escapeRegex(label)}:\\s*(.*)$`, "im");
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function parsePercent(value: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/[%`]/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeToken(value: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function includesAll(content: string, required: string[]) {
  const missing = required.filter((value) => !content.includes(value));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function main() {
  const workspaceRoot = process.cwd();
  const directiveRoot = path.resolve(workspaceRoot, "..", "directive-workspace");
  const profile = getForgePromotionProfile("promotion_quality_gate/v1");
  const promotionDir = path.join(directiveRoot, "forge", "promotion-records");
  const promotionFiles = listPromotionRecordFiles(promotionDir);
  const contractPath = resolveDirectiveWorkspacePath(profile.contractPath);
  const templatePath = path.join(
    directiveRoot,
    "shared",
    "templates",
    "promotion-record.md",
  );

  const requiredFields = [
    "Candidate id",
    "Proof path",
    "Quality gate profile",
    "Promotion profile family",
    "Proof shape",
    "Primary host checker",
    "Full-text coverage threshold (%)",
    "Evidence-binding threshold (%)",
    "Citation-error threshold (%)",
    "Observed full-text coverage (%)",
    "Observed evidence-binding (%)",
    "Observed citation error rate (%)",
    "Quality gate result",
    "Validation state",
    "Quality gate fail reasons",
  ];
  const allowedValidationStates = new Set([
    "self_validated",
    "openreview_related",
    "openreview_not_found",
    "external_validated",
  ]);
  const allowedResults = new Set(["pass", "degraded_quality", "fail"]);

  const contractChecks: ContractCheck[] = [];
  const contractContent = fs.existsSync(contractPath) ? readText(contractPath) : null;
  const templateContent = fs.existsSync(templatePath) ? readText(templatePath) : null;

  contractChecks.push({
    id: "contract-file-exists",
    ok: Boolean(contractContent),
    reason: contractContent ? undefined : `missing contract file: ${contractPath}`,
  });
  contractChecks.push({
    id: "template-file-exists",
    ok: Boolean(templateContent),
    reason: templateContent ? undefined : `missing template file: ${templatePath}`,
  });

  if (contractContent) {
    const ruleCheck = includesAll(contractContent, [
      profile.id,
      profile.family,
      profile.proofShape,
      profile.primaryHostCheckCommand,
      "full-text coverage >= `80%`",
      "evidence-binding >= `90%`",
      "citation-error rate <= `2%`",
      "Quality gate result",
      "Validation state",
      "Quality gate fail reasons",
    ]);
    contractChecks.push({
      id: "contract-baseline-rules",
      ok: ruleCheck.ok,
      reason: ruleCheck.ok
        ? undefined
        : `contract missing required terms: ${ruleCheck.missing.join(", ")}`,
    });
  }

  if (templateContent) {
    const templateCheck = includesAll(templateContent, [
      "Quality gate profile",
      "Promotion profile family",
      "Proof shape",
      "Primary host checker",
      "Full-text coverage threshold (%)",
      "Evidence-binding threshold (%)",
      "Citation-error threshold (%)",
      "Observed full-text coverage (%)",
      "Observed evidence-binding (%)",
      "Observed citation error rate (%)",
      "Quality gate result",
      "Validation state",
      "Quality gate fail reasons",
    ]);
    contractChecks.push({
      id: "template-quality-fields",
      ok: templateCheck.ok,
      reason: templateCheck.ok
        ? undefined
        : `template missing required fields: ${templateCheck.missing.join(", ")}`,
    });
  }

  const checks: PromotionQualityCheck[] = promotionFiles.map((recordPath) => {
    const content = readText(recordPath);
    const missingFields: string[] = [];
    const reasons: string[] = [];
    const candidateId = getFieldValue(content, "Candidate id");
    const proofPathRaw = getFieldValue(content, "Proof path");
    const qualityGateProfile = normalizeToken(
      getFieldValue(content, "Quality gate profile"),
    );
    const profileFamily = getFieldValue(content, "Promotion profile family");
    const proofShape = getFieldValue(content, "Proof shape");
    const primaryHostChecker = String(
      getFieldValue(content, "Primary host checker") || "",
    ).replaceAll("`", "");
    const validationState = normalizeToken(
      getFieldValue(content, "Validation state"),
    );
    const qualityGateResult = normalizeToken(
      getFieldValue(content, "Quality gate result"),
    );
    const failReasons = String(
      getFieldValue(content, "Quality gate fail reasons") || "",
    ).trim();

    for (const field of requiredFields) {
      if (!getFieldValue(content, field)) {
        missingFields.push(field);
      }
    }

    if (qualityGateProfile !== profile.id) {
      return {
        recordPath,
        candidateId,
        qualityGateProfile: qualityGateProfile || null,
        qualityGateResult: qualityGateResult || null,
        validationState: validationState || null,
        ok: missingFields.length === 0,
        skipped: true,
        missingFields,
        reasons: [],
      };
    }

    const thresholdFull = parsePercent(
      getFieldValue(content, "Full-text coverage threshold (%)"),
    );
    const thresholdEvidence = parsePercent(
      getFieldValue(content, "Evidence-binding threshold (%)"),
    );
    const thresholdCitation = parsePercent(
      getFieldValue(content, "Citation-error threshold (%)"),
    );
    const observedFull = parsePercent(
      getFieldValue(content, "Observed full-text coverage (%)"),
    );
    const observedEvidence = parsePercent(
      getFieldValue(content, "Observed evidence-binding (%)"),
    );
    const observedCitation = parsePercent(
      getFieldValue(content, "Observed citation error rate (%)"),
    );

    if (profileFamily !== profile.family) {
      reasons.push(
        `Promotion profile family must be ${profile.family} (got: ${profileFamily || "missing"})`,
      );
    }
    if (proofShape !== profile.proofShape) {
      reasons.push(
        `Proof shape must be ${profile.proofShape} (got: ${proofShape || "missing"})`,
      );
    }
    if (primaryHostChecker !== profile.primaryHostCheckCommand) {
      reasons.push(
        `Primary host checker must be ${profile.primaryHostCheckCommand} (got: ${primaryHostChecker || "missing"})`,
      );
    }
    if (!allowedValidationStates.has(validationState)) {
      reasons.push(
        `Validation state must be one of: ${[...allowedValidationStates].join(", ")}`,
      );
    }
    if (!allowedResults.has(qualityGateResult)) {
      reasons.push(
        `Quality gate result must be one of: ${[...allowedResults].join(", ")}`,
      );
    }

    if (thresholdFull == null || thresholdEvidence == null || thresholdCitation == null) {
      reasons.push("Threshold fields must be numeric");
    } else {
      if (thresholdFull < 80) {
        reasons.push("Full-text coverage threshold must be >= 80%");
      }
      if (thresholdEvidence < 90) {
        reasons.push("Evidence-binding threshold must be >= 90%");
      }
      if (thresholdCitation > 2) {
        reasons.push("Citation-error threshold must be <= 2%");
      }
    }
    if (observedFull == null || observedEvidence == null || observedCitation == null) {
      reasons.push("Observed quality metric fields must be numeric");
    }

    if (
      thresholdFull != null &&
      thresholdEvidence != null &&
      thresholdCitation != null &&
      observedFull != null &&
      observedEvidence != null &&
      observedCitation != null &&
      allowedResults.has(qualityGateResult)
    ) {
      const meetsThresholds =
        observedFull >= thresholdFull &&
        observedEvidence >= thresholdEvidence &&
        observedCitation <= thresholdCitation;
      if (meetsThresholds && qualityGateResult !== "pass") {
        reasons.push("Quality gate result must be pass when observed metrics meet thresholds");
      }
      if (!meetsThresholds && qualityGateResult === "pass") {
        reasons.push("Quality gate result cannot be pass when observed metrics miss thresholds");
      }
      if (!meetsThresholds && qualityGateResult === "degraded_quality" && !failReasons) {
        reasons.push("Degraded quality result requires explicit fail reasons");
      }
      if (qualityGateResult === "pass" && normalizeToken(failReasons) !== "none") {
        reasons.push("Pass result requires 'Quality gate fail reasons: none'");
      }
      if (qualityGateResult !== "pass" && normalizeToken(failReasons) === "none") {
        reasons.push("Non-pass result requires non-empty fail reasons");
      }
    }

    const proofPath = String(proofPathRaw || "").replaceAll("`", "").trim();
    if (!proofPath) {
      reasons.push("Proof path is missing");
    } else if (!fs.existsSync(proofPath)) {
      reasons.push(`Proof path does not exist: ${proofPath}`);
    } else {
      const proofContent = readText(proofPath);
      const proofRequiredTerms = [
        `Quality gate profile: ${profile.id}`,
        `Promotion profile family: ${profile.family}`,
        `Proof shape: ${profile.proofShape}`,
        `Primary host checker: \`${profile.primaryHostCheckCommand}\``,
        "Full-text coverage threshold (%):",
        "Evidence-binding threshold (%):",
        "Citation-error threshold (%):",
        "Observed full-text coverage (%):",
        "Observed evidence-binding (%):",
        "Observed citation error rate (%):",
        "Quality gate result:",
        "Validation state:",
        "Quality gate fail reasons:",
        `\`${profile.primaryHostCheckCommand}\` -> PASS`,
      ];
      for (const term of proofRequiredTerms) {
        if (!proofContent.includes(term)) {
          reasons.push(`Proof artifact missing required quality field: ${term}`);
        }
      }

      const proofCandidateId = normalizeToken(getFieldValue(proofContent, "Candidate id"));
      if (proofCandidateId && proofCandidateId !== normalizeToken(candidateId)) {
        reasons.push(
          `Candidate id mismatch between promotion record (${candidateId}) and proof (${proofCandidateId})`,
        );
      }

      const proofResult = normalizeToken(getFieldValue(proofContent, "Quality gate result"));
      if (proofResult && proofResult !== qualityGateResult) {
        reasons.push(
          `Quality gate result mismatch between promotion record (${qualityGateResult}) and proof (${proofResult})`,
        );
      }
    }

    return {
      recordPath,
      candidateId,
      qualityGateProfile: qualityGateProfile || null,
      qualityGateResult: qualityGateResult || null,
      validationState: validationState || null,
      skipped: false,
      ok: missingFields.length === 0 && reasons.length === 0,
      missingFields,
      reasons,
    };
  });

  const applicableChecks = checks.filter((check) => !check.skipped);
  const skippedChecks = checks.filter((check) => check.skipped);
  const failed = applicableChecks.filter((check) => !check.ok);
  const failedContractChecks = contractChecks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0 && failedContractChecks.length === 0,
    metrics: {
      totalPromotionRecords: checks.length,
      applicablePromotionRecords: applicableChecks.length,
      skippedPromotionRecords: skippedChecks.length,
      failedPromotionRecords: failed.length,
      failedContractChecks: failedContractChecks.length,
      passResults: applicableChecks.filter((check) => check.qualityGateResult === "pass").length,
      degradedResults: applicableChecks.filter(
        (check) => check.qualityGateResult === "degraded_quality",
      ).length,
      failResults: applicableChecks.filter((check) => check.qualityGateResult === "fail")
        .length,
    },
    contractChecks,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.ok) process.exit(1);
}

main();
