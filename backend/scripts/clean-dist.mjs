import { rmSync } from "node:fs";
import { resolve } from "node:path";

const distPath = resolve(process.cwd(), "dist");

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const MAX_ATTEMPTS = 12;
const RETRY_MS = 250;
let cleaned = false;
let lastError = null;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    rmSync(distPath, { recursive: true, force: true });
    cleaned = true;
    break;
  } catch (error) {
    lastError = error;
    const code = error && typeof error === "object" ? error.code : "";
    const retryable =
      code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY";
    if (!retryable) {
      throw error;
    }
    if (attempt < MAX_ATTEMPTS) {
      sleep(RETRY_MS);
      continue;
    }
  }
}

if (cleaned) {
  process.stdout.write(`cleaned ${distPath}\n`);
} else {
  const message =
    lastError && typeof lastError === "object" && "message" in lastError
      ? String(lastError.message)
      : "unknown lock error";
  process.stdout.write(
    `warning: skipped clean for ${distPath} due transient lock (${message})\n`,
  );
}
