import { spawn } from "node:child_process";
import net from "node:net";

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
const WEB_PORT = Number.parseInt(process.env.PORT || "3000", 10);

function parsePortFromUrl(urlValue) {
  try {
    const parsed = new URL(urlValue);
    if (parsed.port) {
      const port = Number.parseInt(parsed.port, 10);
      if (Number.isFinite(port)) return port;
    }

    if (parsed.protocol === "https:") return 443;
    return 80;
  } catch {
    return 3201;
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

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

  const backendPort = parsePortFromUrl(BACKEND_HEALTH_URL);
  const [backendPortFree, webPortFree] = await Promise.all([
    isPortFree(backendPort),
    isPortFree(WEB_PORT),
  ]);

  if (!backendPortFree || !webPortFree) {
    process.stderr.write(
      `[dev:stack] preflight failed: occupied ports detected (backend:${backendPortFree ? "free" : "busy"}, web:${webPortFree ? "free" : "busy"}).\n`,
    );
    process.stderr.write(
      `[dev:stack] run \"npm run dev:doctor\" for details or \"npm run dev:doctor:fix\" to auto-clean local collisions.\n`,
    );
    process.exit(1);
    return;
  }

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
