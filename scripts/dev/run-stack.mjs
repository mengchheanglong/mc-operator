import { spawn } from "node:child_process";

const BACKEND_HEALTH_URL =
  process.env.MISSION_CONTROL_BACKEND_HEALTH_URL?.trim() ||
  "http://127.0.0.1:3201/api/v1/health";
const BACKEND_READY_TIMEOUT_MS = Number.parseInt(
  process.env.MISSION_CONTROL_BACKEND_READY_TIMEOUT_MS || "45000",
  10,
);
const BACKEND_READY_POLL_MS = Number.parseInt(
  process.env.MISSION_CONTROL_BACKEND_READY_POLL_MS || "1000",
  10,
);

const isWindows = process.platform === "win32";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBackendReady() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < BACKEND_READY_TIMEOUT_MS) {
    try {
      const response = await fetch(BACKEND_HEALTH_URL, { method: "GET" });
      if (response.ok) {
        return true;
      }
    } catch {}

    await sleep(BACKEND_READY_POLL_MS);
  }

  return false;
}

function startProcess(args, options = {}) {
  if (isWindows) {
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm", ...args], {
      stdio: "inherit",
      shell: false,
      ...options,
    });
  }

  return spawn("npm", args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

async function main() {
  let shuttingDown = false;
  const children = [];

  const shutdown = (signal = "SIGTERM", exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) {
        child.kill(signal);
      }
    }
    process.exit(exitCode);
  };

  process.on("SIGINT", () => shutdown("SIGINT", 0));
  process.on("SIGTERM", () => shutdown("SIGTERM", 0));

  process.stdout.write(
    `[dev:stack] starting backend: npm --prefix ./backend run dev\n`,
  );
  const backend = startProcess(["--prefix", "./backend", "run", "dev"], {
    cwd: process.cwd(),
  });
  children.push(backend);

  backend.on("exit", (code) => {
    if (!shuttingDown) {
      process.stderr.write(
        `[dev:stack] backend exited early (code=${String(code)}).\n`,
      );
      shutdown("SIGTERM", code ?? 1);
    }
  });

  process.stdout.write(
    `[dev:stack] waiting for backend health: ${BACKEND_HEALTH_URL}\n`,
  );
  const backendReady = await waitForBackendReady();
  if (!backendReady) {
    process.stderr.write(
      `[dev:stack] backend did not become healthy within ${BACKEND_READY_TIMEOUT_MS}ms.\n`,
    );
    shutdown("SIGTERM", 1);
    return;
  }

  process.stdout.write("[dev:stack] backend healthy. starting next dev server.\n");
  const web = startProcess(["run", "dev:web"], { cwd: process.cwd() });
  children.push(web);

  web.on("exit", (code) => {
    shutdown("SIGTERM", code ?? 0);
  });
}

main().catch((error) => {
  process.stderr.write(`[dev:stack] fatal error: ${String(error)}\n`);
  process.exit(1);
});
