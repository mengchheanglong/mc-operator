import {
  validateCodegraphInput,
  validateCodegraphOutput,
  validateExternalRunnerInput,
  validateExternalRunnerOutput,
  validateN8nInput,
  validateN8nOutput,
} from "../src/server/adapters/contracts.ts";
import { runWithReliabilityGate, AdapterReliabilityError } from "../src/server/adapters/reliability-gate.ts";

type CheckResult = { name: string; ok: boolean; code?: string; message?: string };

async function runCase(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  try {
    await fn();
    return { name, ok: true };
  } catch (error) {
    return {
      name,
      ok: false,
      code: error instanceof AdapterReliabilityError ? error.details.code : "check_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runExpectedFailureCase(name: string, expectedCode: string, fn: () => Promise<void>): Promise<CheckResult> {
  try {
    await fn();
    return { name, ok: false, code: "missing_failure", message: `expected ${expectedCode}` };
  } catch (error) {
    if (error instanceof AdapterReliabilityError && error.details.code === expectedCode) {
      return { name, ok: true };
    }
    return {
      name,
      ok: false,
      code: error instanceof AdapterReliabilityError ? error.details.code : "unexpected_failure",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const checks: CheckResult[] = [];

  checks.push(await runCase("n8n-valid", async () => {
    await runWithReliabilityGate(
      { targetUrl: "http://localhost", payload: { ok: true }, idempotencyKey: "k1", timeoutMs: 100 },
      {
        adapter: "n8n-execute",
        source: "check",
        timeoutMs: 100,
        retries: 0,
        validateInput: validateN8nInput,
        validateOutput: validateN8nOutput,
        run: async () => ({ ok: true, status: 200, body: "ok" }),
      },
    );
  }));

  checks.push(await runExpectedFailureCase("n8n-invalid-input", "invalid_input", async () => {
    await runWithReliabilityGate(
      { targetUrl: "", payload: { ok: true }, idempotencyKey: "", timeoutMs: 100 },
      {
        adapter: "n8n-execute",
        source: "check",
        timeoutMs: 100,
        retries: 0,
        validateInput: validateN8nInput,
        validateOutput: validateN8nOutput,
        run: async () => ({ ok: true, status: 200, body: "ok" }),
      },
    );
  }));

  checks.push(await runCase("codegraph-valid", async () => {
    await runWithReliabilityGate(
      { projectRootPath: "C:/repo" },
      {
        adapter: "codegraph-summary",
        source: "check",
        timeoutMs: 100,
        retries: 0,
        validateInput: validateCodegraphInput,
        validateOutput: validateCodegraphOutput,
        run: async () => ({ reasonCode: "summary_missing", reason: "missing" }),
      },
    );
  }));

  checks.push(await runExpectedFailureCase("external-runner-timeout", "timeout", async () => {
    await runWithReliabilityGate(
      { args: ["status"] },
      {
        adapter: "external-runner",
        source: "check",
        timeoutMs: 20,
        retries: 0,
        validateInput: validateExternalRunnerInput,
        validateOutput: validateExternalRunnerOutput,
        run: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200, body: "late", args: ["status"], sessionId: null }), 100)),
      },
    );
  }));

  checks.push(await runExpectedFailureCase("external-runner-retry-exhausted", "execution_failed", async () => {
    let attempts = 0;
    await runWithReliabilityGate(
      { args: ["status"] },
      {
        adapter: "external-runner",
        source: "check",
        timeoutMs: 100,
        retries: 1,
        validateInput: validateExternalRunnerInput,
        validateOutput: validateExternalRunnerOutput,
        run: async () => {
          attempts += 1;
          throw new Error(`transient ${attempts}`);
        },
        isRetryableError: () => true,
      },
    );
  }));

  const output = {
    check: "adapters",
    passed: checks.filter((item) => item.ok).length,
    failed: checks.filter((item) => !item.ok).length,
    checks,
  };

  console.log(JSON.stringify(output, null, 2));
  if (output.failed > 0) {
    process.exitCode = 1;
  }
}

void main();
