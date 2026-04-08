import path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { parseDirectiveIntegrationProof } from "../src/lib/directive-workspace/v0";
import { isDirectiveLifecycleArtifacts } from "../src/lib/directive-workspace/lifecycle-artifacts";

type RegistryRow = {
  capability?: {
    id?: string;
    title?: string;
    status?: string;
    sourceRef?: string;
    metadata?: Record<string, unknown> | null;
  };
  evaluations?: Array<{
    evidenceSummary?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
};

type CapabilityCheck = {
  capabilityId: string;
  title: string;
  status: string;
  sourceRef: string;
  ok: boolean;
  checks: {
    hasEvaluation: boolean;
    hasStrictArtifacts: boolean;
    hasLegacyFallbackEvidence: boolean;
    strictArtifactsValid: boolean;
    integratedHasProof: boolean;
  };
  reasons: string[];
};

function parseJsonSafe(input: string) {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit) {
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

  const port = 3220;
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

function checkCapability(row: RegistryRow): CapabilityCheck {
  const capability = row.capability || {};
  const capabilityId = String(capability.id || "").trim();
  const title = String(capability.title || "").trim() || "unknown";
  const status = String(capability.status || "").trim();
  const sourceRef = String(capability.sourceRef || "").trim() || "unknown";
  const evaluations = Array.isArray(row.evaluations) ? row.evaluations : [];
  const reasons: string[] = [];

  const hasEvaluation = evaluations.length > 0;
  const strictArtifactsRows = evaluations.filter((evaluation) => {
    const metadata =
      evaluation.metadata && typeof evaluation.metadata === "object"
        ? evaluation.metadata
        : {};
    return Number((metadata as Record<string, unknown>).lifecycleArtifactVersion) === 1;
  });
  const hasStrictArtifacts = strictArtifactsRows.length > 0;
  const strictArtifactsValid = strictArtifactsRows.every((evaluation) => {
    const metadata =
      evaluation.metadata && typeof evaluation.metadata === "object"
        ? evaluation.metadata
        : {};
    return isDirectiveLifecycleArtifacts(
      (metadata as Record<string, unknown>).lifecycleArtifacts,
    );
  });
  const hasLegacyFallbackEvidence = evaluations.some((evaluation) =>
    String(evaluation.evidenceSummary || "").trim().length > 0,
  );
  const requiresStrictArtifacts = ["evaluated", "decided", "integrated"].includes(status);

  const integratedHasProof =
    status !== "integrated"
      ? true
      : Boolean(
          parseDirectiveIntegrationProof(
            (capability.metadata || {})?.latestIntegrationProof,
          ),
        );

  if (!capabilityId) reasons.push("missing capability id");
  if (!hasEvaluation) reasons.push("missing evaluation record");
  if (hasStrictArtifacts && !strictArtifactsValid) {
    reasons.push("strict lifecycle artifacts are invalid");
  }
  if (requiresStrictArtifacts && !hasStrictArtifacts) {
    reasons.push("missing strict lifecycle artifacts for evaluated/decided/integrated status");
  } else if (!requiresStrictArtifacts && !hasStrictArtifacts && !hasLegacyFallbackEvidence) {
    reasons.push("missing strict lifecycle artifacts and no legacy fallback evidence");
  }
  if (!integratedHasProof) reasons.push("integrated capability missing valid proof metadata");

  return {
    capabilityId,
    title,
    status,
    sourceRef,
    ok: reasons.length === 0,
    checks: {
      hasEvaluation,
      hasStrictArtifacts,
      hasLegacyFallbackEvidence,
      strictArtifactsValid,
      integratedHasProof,
    },
    reasons,
  };
}

async function main() {
  const projectId = process.argv[2] || "mission-control";
  const { baseUrl, backendProcess } = await ensureBackend();

  try {
    const registryResponse = await fetchJson<{ registry?: RegistryRow[] }>(
      `${baseUrl}/directive-workspace/registry?projectId=${encodeURIComponent(projectId)}`,
    );
    if (!registryResponse.ok || !Array.isArray(registryResponse.body.registry)) {
      const output = {
        ok: false,
        reason: `registry request failed: status=${registryResponse.status}`,
      };
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      process.exit(1);
      return;
    }

    const registry = registryResponse.body.registry;
    const targetRows = registry.filter((row) => {
      const status = String(row.capability?.status || "").trim();
      return status === "evaluated" || status === "decided" || status === "integrated";
    });
    const checks = targetRows.map(checkCapability);
    const failed = checks.filter((check) => !check.ok);

    const output = {
      ok: failed.length === 0,
      metrics: {
        targetCapabilities: checks.length,
        failedCapabilities: failed.length,
        strictRequiredCapabilities: checks.filter((check) =>
          ["evaluated", "decided", "integrated"].includes(check.status),
        ).length,
        strictBoundCapabilities: checks.filter((check) => check.checks.hasStrictArtifacts)
          .length,
        strictMissingCapabilities: checks.filter(
          (check) =>
            ["evaluated", "decided", "integrated"].includes(check.status) &&
            !check.checks.hasStrictArtifacts,
        ).length,
        legacyFallbackCapabilities: checks.filter(
          (check) => !check.checks.hasStrictArtifacts && check.checks.hasLegacyFallbackEvidence,
        ).length,
      },
      checks,
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
