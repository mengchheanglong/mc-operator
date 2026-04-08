import path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { TOOL_ADMISSION_CATALOG } from "./tool-admission/catalog.ts";
import { scoreTool } from "./tool-admission/rubric.ts";
import {
  buildCompatibleAdmissionSourceRefs,
  buildDirectiveWorkspaceAdmissionSourceRef,
} from "./tool-admission/source-ref.ts";

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

async function ensureBackend() {
  const configured =
    process.env.MISSION_CONTROL_BACKEND_BASE_URL?.trim() ||
    "http://127.0.0.1:3201/api/v1";
  if (await isHealthy(configured)) {
    process.env.MISSION_CONTROL_BACKEND_BASE_URL = configured;
    return { baseUrl: configured, backendProcess: null as ChildProcess | null };
  }

  const port = 3213;
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

async function run() {
  const candidate = String(process.argv[2] || "agency-agents").trim();
  const projectId = String(process.argv[3] || "mission-control").trim();
  const { baseUrl, backendProcess } = await ensureBackend();

  try {
    const catalogEntry = TOOL_ADMISSION_CATALOG.find((item) => item.tool === candidate);
    if (!catalogEntry) {
      throw new Error(`invalid_input: candidate not in tool-admission catalog: ${candidate}`);
    }

    const scored = scoreTool(catalogEntry);
    if (scored.status !== "promote") {
      throw new Error(`invalid_input: candidate ${candidate} is not promote; status=${scored.status}`);
    }

    const sourceRef = buildDirectiveWorkspaceAdmissionSourceRef(scored.repoPath);
    const title = scored.tool;
    const listResponse = await fetchJson<{
      capabilities?: Array<{
        id?: string;
        sourceRef?: string;
        title?: string;
        metadata?: Record<string, unknown>;
      }>;
    }>(
      `${baseUrl}/directive-workspace/capabilities?projectId=${encodeURIComponent(projectId)}`,
    );
    if (!listResponse.ok || !Array.isArray(listResponse.body.capabilities)) {
      throw new Error(`failed to list directive capabilities: ${listResponse.status}`);
    }

    let capability =
      listResponse.body.capabilities.find((row) =>
        buildCompatibleAdmissionSourceRefs(scored.repoPath).includes(
          String(row.sourceRef || ""),
        ),
      ) || null;

    if (!capability) {
      const createResponse = await fetchJson<{
        capability?: { id?: string; sourceRef?: string; title?: string; metadata?: Record<string, unknown> };
        msg?: string;
      }>(`${baseUrl}/directive-workspace/capabilities?projectId=${encodeURIComponent(projectId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          sourceType: "github-repo",
          sourceRef,
          title,
          userIntent: `Promote ${candidate} from tool-admission to directive workspace lifecycle.`,
          notes: ["seeded from tool-admission catalog", "backend-first lifecycle runner"],
          metadata: {
            candidate,
            source: "run-directive-candidate-lifecycle",
            admissionScore: scored.score,
            admissionStatus: scored.status,
          },
        }),
      });
      if (!createResponse.ok || !createResponse.body.capability?.id) {
        throw new Error(
          createResponse.body.msg ||
            `failed to create directive capability: ${createResponse.status}`,
        );
      }
      capability = createResponse.body.capability;
    }

    const capabilityId = String(capability.id || "").trim();
    if (!capabilityId) {
      throw new Error("runtime_error: capability missing id after backend sync");
    }

    const executedAt = new Date().toISOString();
    const executionReference = `npm run directive:lifecycle -- ${candidate} ${projectId}`;
    const proofResponse = await fetchJson<{
      reportId?: string;
      reportHref?: string;
      artifactPath?: string;
      integrationProof?: {
        execution?: {
          ok?: boolean;
          method?: string;
          reference?: string;
          timestamp?: string;
        };
        artifact?: {
          reportId?: string;
          reportHref?: string;
          artifactPath?: string;
          summary?: string;
        };
      };
      msg?: string;
    }>(
      `${baseUrl}/directive-workspace/capabilities/${encodeURIComponent(capabilityId)}/proof?projectId=${encodeURIComponent(projectId)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          method: "script",
          reference: executionReference,
          summary: "Lifecycle script execution proof artifact",
        }),
      },
    );
    if (!proofResponse.ok || !proofResponse.body.integrationProof) {
      throw new Error(
        proofResponse.body.msg ||
          `directive proof API failed: ${proofResponse.status}`,
      );
    }

    const lifecycleResponse = await fetchJson<{
      ok?: boolean;
      lifecycle?: {
        capabilityId?: string;
        lifecycle?: {
          status?: string;
          experiments?: number;
          evaluations?: number;
          decisions?: number;
          integrations?: number;
        };
        created?: Record<string, unknown>;
        verification?: Record<string, unknown>;
      };
      msg?: string;
    }>(
      `${baseUrl}/directive-workspace/capabilities/${encodeURIComponent(capabilityId)}/lifecycle?projectId=${encodeURIComponent(projectId)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidate,
          admissionScore: scored.score,
          decidedBy: "operator",
          source: "run-directive-candidate-lifecycle",
          integrationProof: proofResponse.body.integrationProof,
        }),
      },
    );

    if (!lifecycleResponse.ok || !lifecycleResponse.body.lifecycle) {
      throw new Error(
        lifecycleResponse.body.msg ||
          `directive lifecycle API failed: ${lifecycleResponse.status}`,
      );
    }

    const lifecycleRun = lifecycleResponse.body.lifecycle;
    const lifecycleStats = lifecycleRun.lifecycle || {};

    const reportResponse = await fetchJson<
      Array<{ id?: string; area?: string; title?: string }> | {
        reports?: Array<{ id?: string; area?: string; title?: string }>;
      }
    >(
      `${baseUrl}/reports?projectId=${encodeURIComponent(projectId)}&area=directive-workspace&withMeta=1&limit=10`,
    );
    const reportRows = Array.isArray(reportResponse.body)
      ? reportResponse.body
      : Array.isArray(reportResponse.body.reports)
        ? reportResponse.body.reports
        : null;
    if (!reportResponse.ok || !reportRows) {
      throw new Error(`failed to list directive reports: ${reportResponse.status}`);
    }

    const verified = lifecycleResponse.body.ok === true && reportRows.length >= 1;

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: verified,
          candidate,
          sourceRef,
          sync: {
            ok: true,
            mode: "backend-api",
            created: capabilityId,
          },
          proof: {
            reportId: proofResponse.body.reportId || null,
            reportHref: proofResponse.body.reportHref || null,
            artifactPath: proofResponse.body.artifactPath || null,
          },
          lifecycle: {
            capabilityId: lifecycleRun.capabilityId || capabilityId,
            status: lifecycleStats.status || null,
            experiments: lifecycleStats.experiments || 0,
            evaluations: lifecycleStats.evaluations || 0,
            decisions: lifecycleStats.decisions || 0,
            integrations: lifecycleStats.integrations || 0,
          },
          created: lifecycleRun.created || {},
          verification: {
            ...(lifecycleRun.verification || {}),
            directiveReports: reportRows.length,
          },
        },
        null,
        2,
      )}\n`,
    );

    if (!verified) {
      process.exitCode = 1;
    }
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
