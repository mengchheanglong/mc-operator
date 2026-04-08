import path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { parseDirectiveIntegrationProof } from "../src/lib/directive-workspace/v0";

function parseArgs() {
  const args = process.argv.slice(2);
  const projectId = args.find((value) => !value.startsWith("--")) || "mission-control";
  return { projectId };
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

  const port = 3212;
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
  const { projectId } = parseArgs();
  const { backendProcess } = await ensureBackend();

  try {
    const { GET: getRegistry } = await import(
      "../src/app/api/directive-workspace/registry/route.ts"
    );

    const req = new Request(
      `http://localhost/api/directive-workspace/registry?projectId=${projectId}`,
      { method: "GET" },
    );
    const res = await getRegistry(req);
    if (!res.ok) {
      throw new Error(`directive registry request failed: ${res.status}`);
    }

    const payload = (await res.json()) as {
      registry?: Array<{
        capability?: {
          id?: string;
          title?: string;
          sourceRef?: string;
          status?: string;
          runtimeStatus?: string;
          updatedAt?: string;
          metadata?: Record<string, unknown> | null;
        };
      }>;
    };

    const integrated = (payload.registry || [])
      .map((row) => row.capability)
      .filter(
        (capability): capability is NonNullable<typeof capability> =>
          !!capability &&
          (capability.status === "integrated" ||
            capability.runtimeStatus === "callable"),
      );

    const missing = integrated
      .filter((capability) => {
        const metadata = (capability.metadata || {}) as Record<string, unknown>;
        return !parseDirectiveIntegrationProof(metadata.latestIntegrationProof);
      })
      .map((capability) => ({
        id: capability.id,
        title: capability.title,
        sourceRef: capability.sourceRef,
        updatedAt: capability.updatedAt,
      }));

    const output = {
      ok: missing.length === 0,
      projectId,
      totals: {
        integrated: integrated.length,
        missingProof: missing.length,
      },
      missing,
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (missing.length > 0) process.exit(1);
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
