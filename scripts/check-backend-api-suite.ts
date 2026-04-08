import { execSync } from "node:child_process";

type CheckResult = {
  command: string;
  ok: boolean;
  attempts?: number;
  exitCode?: number;
  error?: string;
};

const checksToRun = [
  "npm run check:reports-api-backend",
  "npm run check:projects-api-backend",
  "npm run check:notes-api-backend",
  "npm run check:views-api-backend",
  "npm run check:quests-api-backend",
  "npm run check:docs-api-backend",
  "npm run check:agents-catalog-api-backend",
  "npm run check:agents-runtime-api-backend",
  "npm run check:agents-dispatch-api-backend",
  "npm run check:agents-import-packs-api-backend",
  "npm run check:agents-pack-assets-api-backend",
  "npm run check:agents-send-api-backend",
  "npm run check:automation-runs-api-backend",
  "npm run check:automation-templates-api-backend",
  "npm run check:automation-template-entry-api-backend",
  "npm run check:automation-template-runs-api-backend",
  "npm run check:automation-run-tools-api-backend",
  "npm run check:automation-health-api-backend",
  "npm run check:migration-batch-api-backend",
  "npm run check:automation-template-run-api-backend",
  "npm run check:automation-template-check-api-backend",
  "npm run check:automation-template-execute-api-backend",
];

function runCheck(command: string): CheckResult {
  try {
    execSync(command, { stdio: "pipe" });
    return { command, ok: true, attempts: 1 };
  } catch (error) {
    const failure = error as {
      message?: string;
      status?: number | null;
      stderr?: Buffer | string;
    };
    const stderrText =
      typeof failure.stderr === "string"
        ? failure.stderr
        : failure.stderr instanceof Buffer
          ? failure.stderr.toString()
          : "";
    return {
      command,
      ok: false,
      attempts: 1,
      exitCode: typeof failure.status === "number" ? failure.status : undefined,
      error: stderrText.trim() || failure.message || "unknown error",
    };
  }
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function shouldRetry(result: CheckResult) {
  if (result.ok || !result.error) return false;
  const error = result.error.toLowerCase();
  return (
    error.includes("eperm") ||
    error.includes("ebusy") ||
    error.includes("enotempty") ||
    error.includes("cannot find module './infra/sqlite/sqlite.service'") ||
    error.includes("backend health check timed out") ||
    error.includes("no such table: users") ||
    error.includes("expected missing message to return 400")
  );
}

function runCheckWithRetry(command: string): CheckResult {
  const first = runCheck(command);
  if (!shouldRetry(first)) {
    return first;
  }
  sleep(1200);
  const second = runCheck(command);
  if (second.ok) {
    return { ...second, attempts: 2 };
  }
  return {
    ...second,
    attempts: 2,
    error: `${first.error}\n\nretry_failed:\n${second.error || "unknown error"}`,
  };
}

const checks: CheckResult[] = [];
for (const command of checksToRun) {
  const result = runCheckWithRetry(command);
  checks.push(result);
  sleep(500);
}
const ok = checks.every((check) => check.ok);

process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      checks,
    },
    null,
    2,
  )}\n`,
);

if (!ok) {
  process.exitCode = 1;
}
