import path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";

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

  const port = 3214;
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

function parseJsonSafe(input: string) {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: (parseJsonSafe(text) ?? {}) as T,
  };
}

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface RegistryEntry {
  capability?: {
    id?: string;
    title?: string;
    status?: string;
    frameworkStatus?: string;
    runtimeStatus?: string;
    sourceRef?: string;
    createdAt?: string;
    updatedAt?: string;
    metadata?: Record<string, unknown> | null;
  };
  latestDecision?: { decision?: string; createdAt?: string } | null;
  integrations?: Array<{
    status?: string;
    owner?: string | null;
    dueAt?: string | null;
    targetRuntimeSurface?: string | null;
    requiredGates?: string[] | null;
  }>;
  decisionLeadTimeHours?: number | null;
  adoptToCallableLeadTimeHours?: number | null;
}

function hasValidIntegrationProof(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") return false;
  const proof = metadata.latestIntegrationProof;
  if (!proof || typeof proof !== "object") return false;
  const execution = (proof as Record<string, unknown>).execution;
  if (!execution || typeof execution !== "object") return false;
  return (execution as Record<string, unknown>).ok === true;
}

function hasPromotionTask(entry: RegistryEntry) {
  const integrations = entry.integrations || [];
  return integrations.some((integration) => {
    const owner = String(integration.owner || "").trim();
    const dueAt = String(integration.dueAt || "").trim();
    const targetRuntimeSurface = String(
      integration.targetRuntimeSurface || "",
    ).trim();
    const requiredGates = Array.isArray(integration.requiredGates)
      ? integration.requiredGates.filter((gate) => String(gate || "").trim().length > 0)
      : [];
    return (
      owner.length > 0 &&
      dueAt.length > 0 &&
      !Number.isNaN(new Date(dueAt).getTime()) &&
      targetRuntimeSurface.length > 0 &&
      requiredGates.length > 0
    );
  });
}

async function main() {
  const projectId = process.argv[2] || "mc-operator";
  const staleThresholdHours = envNum("DIRECTIVE_HEALTH_STALE_HOURS", 72);
  const promotionGraceHours = envNum("DIRECTIVE_PROMOTION_GRACE_HOURS", 24);
  const { baseUrl, backendProcess } = await ensureBackend();

  try {
    const registryResponse = await fetchJson<{
      v0?: string;
      registry?: RegistryEntry[];
    }>(`${baseUrl}/directive-workspace/registry?projectId=${encodeURIComponent(projectId)}`);

    if (!registryResponse.ok || !Array.isArray(registryResponse.body.registry)) {
      const output = {
        ok: false,
        reasons: [`registry request failed: status=${registryResponse.status}`],
        metrics: {},
      };
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      process.exit(1);
    }

    const registry = registryResponse.body.registry;
    const reasons: string[] = [];

    // 1. Staleness check: latest directive activity must not be older than threshold
    const allTimestamps = registry
      .map((row) => row.capability?.updatedAt || row.capability?.createdAt || "")
      .filter(Boolean)
      .map((ts) => new Date(ts).getTime())
      .filter((ts) => Number.isFinite(ts));
    const latestActivityMs = allTimestamps.length > 0 ? Math.max(...allTimestamps) : 0;
    const ageHours = latestActivityMs > 0
      ? (Date.now() - latestActivityMs) / (1000 * 60 * 60)
      : Infinity;
    const stale = ageHours > staleThresholdHours;
    if (stale && registry.length > 0) {
      reasons.push(
        `directive activity is stale: last activity ${Math.round(ageHours)}h ago, threshold=${staleThresholdHours}h`,
      );
    }

    // 2. Registry integrity: no malformed integrated entries
    const integrated = registry.filter(
      (row) => row.capability?.status === "integrated",
    );
    const integratedMissingProof = integrated.filter((row) => {
      return !hasValidIntegrationProof(row.capability?.metadata || null);
    });
    if (integratedMissingProof.length > 0) {
      reasons.push(
        `${integratedMissingProof.length} integrated capabilit${integratedMissingProof.length === 1 ? "y is" : "ies are"} missing valid proof`,
      );
    }

    // 3. Decision lead time metric available on decided entries
    const decided = registry.filter(
      (row) =>
        row.capability?.status === "decided" ||
        row.capability?.status === "integrated",
    );
    const decidedMissingLeadTime = decided.filter(
      (row) => row.decisionLeadTimeHours == null,
    );
    if (decidedMissingLeadTime.length > 0) {
      reasons.push(
        `${decidedMissingLeadTime.length} decided/integrated capabilit${decidedMissingLeadTime.length === 1 ? "y is" : "ies are"} missing decisionLeadTimeHours`,
      );
    }

    // 4. Promotion guard: adopt decisions must have task/proof within grace window
    const adopted = registry.filter(
      (row) => row.latestDecision?.decision === "adopt",
    );
    const adoptMissingContract = adopted.filter((row) => !hasPromotionTask(row));
    if (adoptMissingContract.length > 0) {
      reasons.push(
        `${adoptMissingContract.length} adopted capabilit${adoptMissingContract.length === 1 ? "y is" : "ies are"} missing promotion contract fields (owner/dueAt/targetRuntimeSurface/requiredGates)`,
      );
    }

    const adoptStaleWithoutTaskOrProof = adopted.filter((row) => {
      const decisionAt = String(row.latestDecision?.createdAt || "");
      const decisionMs = new Date(decisionAt).getTime();
      if (!Number.isFinite(decisionMs)) return false;
      const ageHoursSinceAdopt = (Date.now() - decisionMs) / (1000 * 60 * 60);
      if (ageHoursSinceAdopt <= promotionGraceHours) return false;
      const hasTask = hasPromotionTask(row);
      const hasProof = hasValidIntegrationProof(row.capability?.metadata || null);
      return !hasTask && !hasProof;
    });
    if (adoptStaleWithoutTaskOrProof.length > 0) {
      reasons.push(
        `${adoptStaleWithoutTaskOrProof.length} adopted capabilit${adoptStaleWithoutTaskOrProof.length === 1 ? "y is" : "ies are"} stale without promotion task/proof after ${promotionGraceHours}h`,
      );
    }

    // Metrics
    const leadTimes = decided
      .map((row) => row.decisionLeadTimeHours)
      .filter((v): v is number => v != null);
    const avgLeadTime =
      leadTimes.length > 0
        ? Math.round((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) * 100) / 100
        : null;
    const adoptCallableLeadTimes = adopted
      .map((row) => row.adoptToCallableLeadTimeHours)
      .filter((v): v is number => v != null);
    const avgAdoptToCallableLeadTime =
      adoptCallableLeadTimes.length > 0
        ? Math.round(
            (adoptCallableLeadTimes.reduce((a, b) => a + b, 0) /
              adoptCallableLeadTimes.length) *
              100,
          ) / 100
        : null;

    const ok = reasons.length === 0;
    const output = {
      ok,
      reasons,
      metrics: {
        totalCapabilities: registry.length,
        integrated: integrated.length,
        decided: decided.length,
        adopted: adopted.length,
        integratedMissingProof: integratedMissingProof.length,
        decidedMissingLeadTime: decidedMissingLeadTime.length,
        adoptMissingPromotionContract: adoptMissingContract.length,
        adoptStaleWithoutTaskOrProof: adoptStaleWithoutTaskOrProof.length,
        avgDecisionLeadTimeHours: avgLeadTime,
        avgAdoptToCallableLeadTimeHours: avgAdoptToCallableLeadTime,
        latestActivityAgeHours: latestActivityMs > 0 ? Math.round(ageHours * 100) / 100 : null,
        staleThresholdHours,
        promotionGraceHours,
      },
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!ok) process.exit(1);
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
