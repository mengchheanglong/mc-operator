import path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { TOOL_ADMISSION_CATALOG } from "./tool-admission/catalog.ts";
import { scoreTool, type AdmissionStatus, type ToolAdmissionResult } from "./tool-admission/rubric.ts";
import {
  buildCompatibleAdmissionSourceRefs,
  buildDirectiveWorkspaceAdmissionSourceRef,
} from "./tool-admission/source-ref.ts";

type DirectiveCapability = {
  id?: string;
  status?: string;
  sourceRef?: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

type BackendListResponse = {
  v0?: string;
  capabilities?: DirectiveCapability[];
  msg?: string;
};

type BackendCreateResponse = {
  ok?: boolean;
  capability?: DirectiveCapability;
  msg?: string;
};

type BackendAnalysisResponse = {
  ok?: boolean;
  capability?: DirectiveCapability;
  msg?: string;
};

type BackendJsonResponse<T> = {
  ok: boolean;
  status: number;
  body: T;
};

function mapStatusToRecommendation(status: AdmissionStatus) {
  if (status === "promote") return "test" as const;
  if (status === "park") return "monitor" as const;
  return "ignore" as const;
}

function buildAnalysisSummary(result: ToolAdmissionResult) {
  return [
    `Admission status: ${result.status}.`,
    `Score: ${result.score}.`,
    result.reason,
    `Next action: ${result.nextAction}`,
  ].join(" ");
}

function shouldProtectManualLifecycle(row: DirectiveCapability) {
  return (
    row.status === "experimenting" ||
    row.status === "evaluated" ||
    row.status === "decided" ||
    row.status === "integrated"
  );
}

function parseJsonSafe(input: string) {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<BackendJsonResponse<T>> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });
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

  const port = 3215;
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

async function listCapabilities(baseUrl: string, projectId: string) {
  const result = await fetchJson<BackendListResponse>(
    `${baseUrl}/directive-workspace/capabilities?projectId=${encodeURIComponent(projectId)}`,
  );
  if (!result.ok || !Array.isArray(result.body.capabilities)) {
    throw new Error(
      result.body.msg || `failed to list directive capabilities: ${result.status}`,
    );
  }
  return result.body.capabilities;
}

async function createCapability(baseUrl: string, projectId: string, result: ToolAdmissionResult) {
  const payload = {
    projectId,
    sourceType: "github-repo",
    sourceRef: buildDirectiveWorkspaceAdmissionSourceRef(result.repoPath),
    title: result.tool,
    userIntent: `Evaluate ${result.tool} for workspace adoption.`,
    notes: [
      "seeded-from-tool-admission",
      `admission-status:${result.status}`,
      `admission-score:${result.score}`,
    ],
    metadata: {
      seededFrom: "tool-admission-catalog",
      tool: result.tool,
      admissionStatus: result.status,
      admissionScore: result.score,
      weightedBreakdown: result.weightedBreakdown,
    },
  };

  const response = await fetchJson<BackendCreateResponse>(
    `${baseUrl}/directive-workspace/capabilities?projectId=${encodeURIComponent(projectId)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok || !response.body.capability?.id) {
    throw new Error(response.body.msg || `failed to create capability: ${response.status}`);
  }

  return response.body.capability;
}

async function recordAnalysis(baseUrl: string, projectId: string, capabilityId: string, result: ToolAdmissionResult) {
  const response = await fetchJson<BackendAnalysisResponse>(
    `${baseUrl}/directive-workspace/capabilities/${encodeURIComponent(capabilityId)}/analysis?projectId=${encodeURIComponent(projectId)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        analysisSummary: buildAnalysisSummary(result),
        category: "tooling-repo",
        problemFit: "capability-adoption",
        overlapNotes: result.criteria.workflowFit.evidence,
        riskNotes: result.criteria.runtimeReliability.evidence,
        recommendation: mapStatusToRecommendation(result.status),
        metadata: {
          seededFrom: "tool-admission-catalog",
          tool: result.tool,
          repoPath: result.repoPath,
          admissionStatus: result.status,
          admissionScore: result.score,
          weightedBreakdown: result.weightedBreakdown,
          nextAction: result.nextAction,
        },
      }),
    },
  );

  if (!response.ok || !response.body.capability?.id) {
    throw new Error(response.body.msg || `failed to record analysis: ${response.status}`);
  }

  return response.body.capability;
}

async function run() {
  const projectId = String(process.argv[2] || "mc-operator").trim();
  const scored = TOOL_ADMISSION_CATALOG.map(scoreTool).sort((a, b) =>
    a.tool.localeCompare(b.tool),
  );
  const { backendProcess, baseUrl } = await ensureBackend();

  try {
    const existing = await listCapabilities(baseUrl, projectId);
    const existingBySourceRef = new Map(
      existing
        .filter((capability) => typeof capability.sourceRef === "string")
        .map((capability) => [String(capability.sourceRef), capability]),
    );

    let created = 0;
    let analyzed = 0;
    let protectedCount = 0;

    for (const result of scored) {
      const sourceRefs = buildCompatibleAdmissionSourceRefs(result.repoPath);
      let capability =
        sourceRefs
          .map((sourceRef) => existingBySourceRef.get(sourceRef))
          .find(Boolean) || null;

      if (!capability) {
        capability = await createCapability(baseUrl, projectId, result);
        existingBySourceRef.set(
          buildDirectiveWorkspaceAdmissionSourceRef(result.repoPath),
          capability,
        );
        created += 1;
      }

      if (shouldProtectManualLifecycle(capability)) {
        protectedCount += 1;
        continue;
      }

      capability = await recordAnalysis(baseUrl, projectId, String(capability.id || ""), result);
      existingBySourceRef.set(
        buildDirectiveWorkspaceAdmissionSourceRef(result.repoPath),
        capability,
      );
      analyzed += 1;
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          projectId,
          totalCatalog: scored.length,
          created,
          analyzed,
          protected: protectedCount,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill("SIGTERM");
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
