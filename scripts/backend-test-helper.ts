import { execSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface BackendTestContext {
  tempDir: string;
  sqlitePath: string;
  backendBaseUrl: string;
}

async function waitForHealth(baseUrl: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`backend health check timed out: ${baseUrl}/health`);
}

export async function withBackendTestEnv(
  options: {
    port: number;
    tempPrefix: string;
    sqliteFilename: string;
    setup?: (tempDir: string, sqlitePath: string) => Record<string, string>;
  },
  testFn: (ctx: BackendTestContext) => Promise<void>,
): Promise<void> {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), options.tempPrefix));
  const sqlitePath = path.join(tempDir, options.sqliteFilename);
  process.env.SQLITE_PATH = sqlitePath;

  const backendBaseUrl = `http://127.0.0.1:${options.port}/api/v1`;
  process.env.MISSION_CONTROL_BACKEND_BASE_URL = backendBaseUrl;

  const extraEnv = options.setup?.(tempDir, sqlitePath) ?? {};
  for (const [key, value] of Object.entries(extraEnv)) {
    process.env[key] = value;
  }

  let backendProcess: ChildProcess | null = null;
  let backendStdout = "";
  let backendStderr = "";

  try {
    execSync("npm --prefix ./backend run build", { stdio: "pipe" });

    backendProcess = spawn(process.execPath, [path.join("dist", "main.js")], {
      cwd: path.join(process.cwd(), "backend"),
      env: {
        ...process.env,
        SQLITE_PATH: sqlitePath,
        MISSION_CONTROL_BACKEND_PORT: String(options.port),
        MISSION_CONTROL_BACKEND_HOST: "127.0.0.1",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    backendProcess.stdout?.on("data", (chunk) => {
      backendStdout += chunk.toString();
    });
    backendProcess.stderr?.on("data", (chunk) => {
      backendStderr += chunk.toString();
    });

    try {
      await waitForHealth(backendBaseUrl, 20_000);
    } catch (error) {
      console.error("Backend startup stdout:", backendStdout);
      console.error("Backend startup stderr:", backendStderr);
      throw error;
    }

    await testFn({ tempDir, sqlitePath, backendBaseUrl });
  } finally {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill("SIGTERM");
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
