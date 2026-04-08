import test from "node:test";
import assert from "node:assert/strict";
import { runWithReliabilityGate, AdapterReliabilityError } from "../../src/server/adapters/reliability-gate.ts";

test("adapter gate accepts valid input/output", async () => {
  const result = await runWithReliabilityGate(
    { payload: "ok" },
    {
      adapter: "test-adapter",
      source: "test",
      timeoutMs: 100,
      retries: 0,
      validateInput: () => [],
      validateOutput: () => [],
      run: async () => ({ ok: true }),
    },
  );

  assert.deepEqual(result, { ok: true });
});

test("adapter gate rejects invalid input", async () => {
  await assert.rejects(
    () =>
      runWithReliabilityGate(
        { payload: "bad" },
        {
          adapter: "test-adapter",
          source: "test",
          timeoutMs: 100,
          retries: 0,
          validateInput: () => ["payload invalid"],
          validateOutput: () => [],
          run: async () => ({ ok: true }),
        },
      ),
    (error: unknown) => error instanceof AdapterReliabilityError && error.details.code === "invalid_input",
  );
});

test("adapter gate timeout path returns normalized timeout error", async () => {
  await assert.rejects(
    () =>
      runWithReliabilityGate(
        { payload: "slow" },
        {
          adapter: "test-adapter",
          source: "test",
          timeoutMs: 20,
          retries: 0,
          validateInput: () => [],
          validateOutput: () => [],
          run: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100)),
        },
      ),
    (error: unknown) => error instanceof AdapterReliabilityError && error.details.code === "timeout",
  );
});

test("adapter gate retry exhaustion path returns normalized error", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      runWithReliabilityGate(
        { payload: "retry" },
        {
          adapter: "test-adapter",
          source: "test",
          timeoutMs: 100,
          retries: 1,
          validateInput: () => [],
          validateOutput: () => [],
          run: async () => {
            attempts += 1;
            throw new Error("temporary failure");
          },
          isRetryableError: () => true,
        },
      ),
    (error: unknown) => error instanceof AdapterReliabilityError && error.details.code === "execution_failed",
  );

  assert.equal(attempts, 2);
});
