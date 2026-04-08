import path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { parseDirectiveIntegrationProof } from "../src/lib/directive-workspace/v0";

interface BackfillResult {
  capabilityId: string;
  title: string;
  sourceRef: string;
  action: "exists" | "created" | "error";
  reportId?: string | null;
  artifactPath?: string | null;
  error?: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const projectId = args.find((value) => !value.startsWith("--")) || "mission-control";
  return { projectId, dryRun };
}

interface CapabilityPayload {
  id?: string;
  title?: string;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
}

interface JsonResponse<T> {
  status: number;
  ok: boolean;
  body: T;
}

function parseJsonSafe(input: string) {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  return {
    status: response.status,
    ok: response.ok,
    body: (parsed ?? ({} as Record<string, unknown>)) as T,
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

async function main() {
  const { projectId, dryRun } = parseArgs();
  const { baseUrl, backendProcess } = await ensureBackend();

  try {
    const integratedRes = await fetchJson<{
      capabilities?: CapabilityPayload[];
      msg?: string;
    }>(
      `${baseUrl}/directive-workspace/capabilities?projectId=${encodeURIComponent(projectId)}&status=integrated`,
    );

    if (!integratedRes.ok || !Array.isArray(integratedRes.body.capabilities)) {
      throw new Error(
        integratedRes.body.msg ||
          `failed to list integrated capabilities: ${integratedRes.status}`,
      );
    }

    const integrated = integratedRes.body.capabilities;
    const results: BackfillResult[] = [];
    for (const capability of integrated) {
      const capabilityId = String(capability.id || "").trim();
      const title = String(capability.title || "").trim();
      const sourceRef = String(capability.sourceRef || "").trim();
      const metadata =
        capability.metadata && typeof capability.metadata === "object"
          ? capability.metadata
          : {};
      const existingProof = parseDirectiveIntegrationProof(
        (metadata as Record<string, unknown>).latestIntegrationProof,
      );

      if (!capabilityId) {
        results.push({
          capabilityId: "",
          title: title || "unknown",
          sourceRef: sourceRef || "unknown",
          action: "error",
          error: "invalid capability payload: missing id",
        });
        continue;
      }

      if (existingProof) {
        results.push({
          capabilityId,
          title,
          sourceRef,
          action: "exists",
        });
        continue;
      }

      if (dryRun) {
        results.push({
          capabilityId,
          title,
          sourceRef,
          action: "created",
          reportId: null,
          artifactPath: null,
        });
        continue;
      }

      try {
        const proofRes = await fetchJson<{
          reportId?: string;
          artifactPath?: string;
          msg?: string;
        }>(
          `${baseUrl}/directive-workspace/capabilities/${encodeURIComponent(capabilityId)}/proof?projectId=${encodeURIComponent(projectId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              projectId,
              method: "backfill-proof",
              reference: `directive-backfill:${projectId}:${capabilityId}`,
              summary:
                "Backfilled integration proof for legacy integrated capability.",
            }),
          },
        );

        if (!proofRes.ok) {
          throw new Error(
            proofRes.body.msg ||
              `proof endpoint failed with status ${proofRes.status}`,
          );
        }

        results.push({
          capabilityId,
          title,
          sourceRef,
          action: "created",
          reportId: proofRes.body.reportId || null,
          artifactPath: proofRes.body.artifactPath || null,
        });
      } catch (error) {
        results.push({
          capabilityId,
          title,
          sourceRef,
          action: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const created = results.filter((row) => row.action === "created").length;
    const existing = results.filter((row) => row.action === "exists").length;
    const errors = results.filter((row) => row.action === "error");
    const output = {
      ok: errors.length === 0,
      projectId,
      dryRun,
      totals: {
        integrated: integrated.length,
        existing,
        created,
        errors: errors.length,
      },
      results,
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (errors.length > 0) process.exit(1);
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
