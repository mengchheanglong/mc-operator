import fs from "node:fs";
import path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { parseDirectiveIntegrationProof } from "../src/lib/directive-workspace/v0";

type DocCheck = {
  id: string;
  ok: boolean;
  reason: string | null;
};

type IntegratedCapabilityCheck = {
  capabilityId: string;
  title: string;
  sourceRef: string;
  ok: boolean;
  checks: {
    hasParsedProof: boolean;
    proofArtifactExists: boolean;
    proofArtifactShape: boolean;
    hasEvidenceSummary: boolean;
    latestDecisionAdopt: boolean;
    hasActiveIntegration: boolean;
    requiredGatesCoverage: boolean;
  };
  reasons: string[];
};

type RegistryCapability = {
  id?: string;
  title?: string;
  sourceRef?: string;
  status?: string;
  metadata?: Record<string, unknown> | null;
};

type RegistryEvaluation = {
  evidenceSummary?: string | null;
};

type RegistryIntegration = {
  status?: string | null;
  requiredGates?: string[] | null;
  proofArtifactPath?: string | null;
};

type RegistryDecision = {
  decision?: string | null;
};

type RegistryRow = {
  capability?: RegistryCapability;
  evaluations?: RegistryEvaluation[];
  latestDecision?: RegistryDecision | null;
  integrations?: RegistryIntegration[];
};

type JsonResponse<T> = {
  ok: boolean;
  status: number;
  body: T;
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

function parseJsonSafe(input: string) {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  return {
    ok: response.ok,
    status: response.status,
    body: (parsed ?? {}) as T,
  };
}

async function isHealthy(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(baseUrl: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isHealthy(baseUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`backend health check timed out: ${baseUrl}/health`);
}

async function ensureBackend() {
  const configured =
    process.env.MISSION_CONTROL_BACKEND_BASE_URL?.trim() ||
    "http://127.0.0.1:3201/api/v1";
  if (await isHealthy(configured)) {
    process.env.MISSION_CONTROL_BACKEND_BASE_URL = configured;
    return { baseUrl: configured, backendProcess: null as ChildProcess | null };
  }

  const port = 3219;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  process.env.MISSION_CONTROL_BACKEND_BASE_URL = baseUrl;
  execSync("npm --prefix ./backend run build", { stdio: "pipe" });

  const backendProcess = spawn(process.execPath, [path.join("dist", "main.js")], {
    cwd: path.join(process.cwd(), "backend"),
    env: {
      ...process.env,
      MISSION_CONTROL_BACKEND_PORT: String(port),
      MISSION_CONTROL_BACKEND_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForHealth(baseUrl, 20_000);
  return { baseUrl, backendProcess };
}

function checkContractDocs(directiveRoot: string) {
  const contractPath = path.join(
    directiveRoot,
    "architecture",
    "05-reference-patterns",
    "2026-03-20-stage-evidence-citation-handoff-contract.md",
  );
  const paper2CodePath = path.join(
    directiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-19-paper2code-directive-architecture-adopted-planned-next.md",
  );
  const gptResearcherPath = path.join(
    directiveRoot,
    "architecture",
    "03-adopted",
    "2026-03-19-gpt-researcher-directive-architecture-adopted-planned-next.md",
  );

  const checks: DocCheck[] = [];
  const contract = readIfExists(contractPath);
  const paper2Code = readIfExists(paper2CodePath);
  const gptResearcher = readIfExists(gptResearcherPath);

  checks.push({
    id: "contract-file-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing file: ${contractPath}`,
  });
  checks.push({
    id: "paper2code-adopted-file-exists",
    ok: Boolean(paper2Code),
    reason: paper2Code ? null : `missing file: ${paper2CodePath}`,
  });
  checks.push({
    id: "gpt-researcher-adopted-file-exists",
    ok: Boolean(gptResearcher),
    reason: gptResearcher ? null : `missing file: ${gptResearcherPath}`,
  });

  if (contract) {
    const requiredContractTerms = [
      "IntakeNormalizedArtifact",
      "AnalysisPlanArtifact",
      "ExperimentDesignArtifact",
      "IntegrationContractArtifact",
      "ProofChecklistArtifact",
      "AnalysisEvidenceArtifact",
      "CitationSetArtifact",
      "EvaluationSupportArtifact",
      "fail-closed",
      "degrade to `partial`",
      "coverage_status",
    ];
    const result = includesAll(contract, requiredContractTerms);
    checks.push({
      id: "contract-artifact-vocabulary-and-rules",
      ok: result.ok,
      reason: result.ok ? null : `missing terms: ${result.missing.join(", ")}`,
    });
  }

  if (paper2Code) {
    const result = includesAll(paper2Code, [
      "IntakeNormalizedArtifact",
      "AnalysisPlanArtifact",
      "ExperimentDesignArtifact",
      "IntegrationContractArtifact",
      "ProofChecklistArtifact",
    ]);
    checks.push({
      id: "paper2code-stage-artifacts-present",
      ok: result.ok,
      reason: result.ok ? null : `missing terms: ${result.missing.join(", ")}`,
    });
  }

  if (gptResearcher) {
    const result = includesAll(gptResearcher, [
      "AnalysisEvidenceArtifact",
      "CitationSetArtifact",
      "EvaluationSupportArtifact",
      "partial",
    ]);
    checks.push({
      id: "gpt-researcher-evidence-citation-artifacts-present",
      ok: result.ok,
      reason: result.ok ? null : `missing terms: ${result.missing.join(", ")}`,
    });
  }

  return checks;
}

function checkIntegratedCapability(row: RegistryRow): IntegratedCapabilityCheck {
  const capability = row.capability || {};
  const capabilityId = String(capability.id || "").trim();
  const title = String(capability.title || "").trim() || "unknown";
  const sourceRef = String(capability.sourceRef || "").trim() || "unknown";
  const reasons: string[] = [];

  const metadata =
    capability.metadata && typeof capability.metadata === "object"
      ? capability.metadata
      : null;
  const parsedProof = parseDirectiveIntegrationProof(
    metadata ? (metadata as Record<string, unknown>).latestIntegrationProof : null,
  );
  const proofArtifactPath = parsedProof?.artifact.artifactPath || null;
  const proofArtifactExists = Boolean(proofArtifactPath && fs.existsSync(proofArtifactPath));

  let proofArtifactShape = false;
  if (proofArtifactExists && proofArtifactPath && capabilityId) {
    const proofContent = fs.readFileSync(proofArtifactPath, "utf8");
    proofArtifactShape =
      proofContent.includes("# Directive Integration Proof") &&
      proofContent.includes(`- capabilityId: ${capabilityId}`) &&
      proofContent.includes("- sourceRef:") &&
      proofContent.includes("Summary:");
  }

  const evidenceRows = Array.isArray(row.evaluations) ? row.evaluations : [];
  const hasEvidenceSummary = evidenceRows.some((evaluation) =>
    String(evaluation?.evidenceSummary || "").trim().length > 0,
  );

  const latestDecisionAdopt = row.latestDecision?.decision === "adopt";

  const integrations = Array.isArray(row.integrations) ? row.integrations : [];
  const activeIntegration =
    integrations.find((integration) => integration?.status === "active") || null;
  const hasActiveIntegration = Boolean(activeIntegration);

  const requiredGates = Array.isArray(activeIntegration?.requiredGates)
    ? activeIntegration?.requiredGates?.filter((gate) => String(gate || "").trim().length > 0)
    : [];
  const requiredGatesCoverage =
    requiredGates.length >= 2 &&
    requiredGates.includes("npm run check:directive-v0") &&
    requiredGates.includes("npm run check:ops-stack");

  if (!capabilityId) reasons.push("missing capability id");
  if (!parsedProof) reasons.push("missing/invalid latestIntegrationProof metadata");
  if (!proofArtifactExists) reasons.push("missing proof artifact file");
  if (proofArtifactExists && !proofArtifactShape) {
    reasons.push("proof artifact content shape invalid");
  }
  if (!hasEvidenceSummary) reasons.push("missing evaluation evidence summary");
  if (!latestDecisionAdopt) reasons.push("latest decision is not adopt");
  if (!hasActiveIntegration) reasons.push("missing active integration");
  if (hasActiveIntegration && !requiredGatesCoverage) {
    reasons.push("active integration required gates missing directive-v0 or ops-stack");
  }

  const checks = {
    hasParsedProof: Boolean(parsedProof),
    proofArtifactExists,
    proofArtifactShape,
    hasEvidenceSummary,
    latestDecisionAdopt,
    hasActiveIntegration,
    requiredGatesCoverage,
  };

  return {
    capabilityId,
    title,
    sourceRef,
    ok: reasons.length === 0,
    checks,
    reasons,
  };
}

async function main() {
  const projectId = process.argv[2] || "mission-control";
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const docChecks = checkContractDocs(directiveRoot);
  const { baseUrl, backendProcess } = await ensureBackend();

  try {
    const registryResponse = await fetchJson<{
      registry?: RegistryRow[];
    }>(`${baseUrl}/directive-workspace/registry?projectId=${encodeURIComponent(projectId)}`);

    if (!registryResponse.ok || !Array.isArray(registryResponse.body.registry)) {
      const output = {
        ok: false,
        metrics: {
          integratedCapabilities: 0,
          failedIntegratedCapabilities: 0,
          failedDocChecks: docChecks.filter((check) => !check.ok).length,
        },
        reason: `registry request failed: status=${registryResponse.status}`,
        docChecks,
        capabilityChecks: [],
      };
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      process.exit(1);
      return;
    }

    const integratedRows = registryResponse.body.registry.filter(
      (row) => row.capability?.status === "integrated",
    );
    const capabilityChecks = integratedRows.map(checkIntegratedCapability);

    const failedDocChecks = docChecks.filter((check) => !check.ok);
    const failedCapabilityChecks = capabilityChecks.filter((check) => !check.ok);

    const output = {
      ok:
        failedDocChecks.length === 0 &&
        integratedRows.length > 0 &&
        failedCapabilityChecks.length === 0,
      metrics: {
        integratedCapabilities: integratedRows.length,
        failedIntegratedCapabilities: failedCapabilityChecks.length,
        failedDocChecks: failedDocChecks.length,
        integratedWithoutProofArtifact: capabilityChecks.filter(
          (check) => !check.checks.proofArtifactExists,
        ).length,
        integratedWithoutEvidenceSummary: capabilityChecks.filter(
          (check) => !check.checks.hasEvidenceSummary,
        ).length,
        integratedWithoutAdoptDecision: capabilityChecks.filter(
          (check) => !check.checks.latestDecisionAdopt,
        ).length,
        integratedWithoutActiveIntegration: capabilityChecks.filter(
          (check) => !check.checks.hasActiveIntegration,
        ).length,
      },
      docChecks,
      capabilityChecks,
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!output.ok) process.exit(1);
  } finally {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
