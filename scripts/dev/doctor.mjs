import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const shouldFix = process.argv.includes("--fix");
const webPort = Number.parseInt(process.env.PORT || "3000", 10);
const backendPort = Number.parseInt(process.env.MISSION_CONTROL_BACKEND_PORT || "3201", 10);
const root = process.cwd();
const lockFiles = [
  path.join(root, ".next", "dev", "lock"),
  path.join(root, ".next", "lock"),
];

function unique(values) {
  return Array.from(new Set(values));
}

function parsePortFromAddress(address) {
  const trimmed = String(address || "").trim();
  const index = trimmed.lastIndexOf(":");
  if (index < 0) return null;
  const value = Number.parseInt(trimmed.slice(index + 1), 10);
  if (!Number.isFinite(value)) return null;
  return value;
}

function listListeningPidsWindows() {
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
    windowsHide: true,
    cwd: root,
  });
  if (result.status !== 0) {
    return [];
  }

  const lines = String(result.stdout || "").split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("TCP")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    const state = parts[3];
    if (!state || state.toUpperCase() !== "LISTENING") continue;
    const localAddress = parts[1];
    const pid = Number.parseInt(parts[4], 10);
    const port = parsePortFromAddress(localAddress);
    if (!Number.isFinite(pid) || !Number.isFinite(port)) continue;
    items.push({ pid, port });
  }

  return items;
}

function listListeningPidsUnix() {
  const result = spawnSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], {
    encoding: "utf8",
    cwd: root,
  });
  if (result.status !== 0) {
    return [];
  }

  const lines = String(result.stdout || "").split(/\r?\n/).slice(1);
  const items = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    const pid = Number.parseInt(parts[1], 10);
    const nameField = parts[8];
    const port = parsePortFromAddress(nameField);
    if (!Number.isFinite(pid) || !Number.isFinite(port)) continue;
    items.push({ pid, port });
  }

  return items;
}

function listListeningPids() {
  return isWindows ? listListeningPidsWindows() : listListeningPidsUnix();
}

function killPid(pid) {
  if (!Number.isFinite(pid) || pid <= 0) {
    return { ok: false, detail: "invalid_pid" };
  }

  if (isWindows) {
    const result = spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      encoding: "utf8",
      windowsHide: true,
      cwd: root,
    });
    return {
      ok: result.status === 0,
      detail: String(result.stdout || result.stderr || "").trim(),
    };
  }

  const result = spawnSync("kill", ["-TERM", String(pid)], {
    encoding: "utf8",
    cwd: root,
  });
  return {
    ok: result.status === 0,
    detail: String(result.stdout || result.stderr || "").trim(),
  };
}

function lockReport() {
  return lockFiles
    .map((filePath) => {
      const exists = fs.existsSync(filePath);
      return {
        file: filePath,
        exists,
      };
    })
    .filter((item) => item.exists);
}

function removeLockFiles() {
  const removed = [];
  const failed = [];
  for (const filePath of lockFiles) {
    if (!fs.existsSync(filePath)) continue;
    try {
      fs.rmSync(filePath, { force: true });
      removed.push(filePath);
    } catch (error) {
      failed.push({
        file: filePath,
        reason: String(error || "remove_failed"),
      });
    }
  }
  return { removed, failed };
}

function summarizePort(pairs, port) {
  const pids = unique(pairs.filter((item) => item.port === port).map((item) => item.pid));
  return {
    port,
    occupied: pids.length > 0,
    pids,
  };
}

function main() {
  const listeners = listListeningPids();
  const web = summarizePort(listeners, webPort);
  const backend = summarizePort(listeners, backendPort);
  const locks = lockReport();

  const summary = {
    ok: !web.occupied && !backend.occupied && locks.length === 0,
    mode: shouldFix ? "fix" : "check",
    ports: {
      web,
      backend,
    },
    locks,
    actions: {
      killedPids: [],
      failedKills: [],
      removedLocks: [],
      failedLockRemovals: [],
    },
  };

  if (shouldFix) {
    const pidsToKill = unique([...web.pids, ...backend.pids]);
    for (const pid of pidsToKill) {
      const result = killPid(pid);
      if (result.ok) {
        summary.actions.killedPids.push({ pid });
      } else {
        summary.actions.failedKills.push({ pid, reason: result.detail || "kill_failed" });
      }
    }

    const remaining = listListeningPids();
    const webAfter = summarizePort(remaining, webPort);
    const backendAfter = summarizePort(remaining, backendPort);

    const canRemoveLocks = !webAfter.occupied && !backendAfter.occupied;
    if (canRemoveLocks) {
      const lockRemoval = removeLockFiles();
      summary.actions.removedLocks = lockRemoval.removed;
      summary.actions.failedLockRemovals = lockRemoval.failed;
    }

    const finalLocks = lockReport();
    summary.ports.web = webAfter;
    summary.ports.backend = backendAfter;
    summary.locks = finalLocks;
    summary.ok =
      !webAfter.occupied &&
      !backendAfter.occupied &&
      finalLocks.length === 0 &&
      summary.actions.failedKills.length === 0 &&
      summary.actions.failedLockRemovals.length === 0;
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (!summary.ok) {
    process.exit(1);
  }
}

main();
