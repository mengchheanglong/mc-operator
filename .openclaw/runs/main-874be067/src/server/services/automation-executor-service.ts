import { runWithReliabilityGate, AdapterReliabilityError } from "@/server/adapters/reliability-gate";
import { validateN8nInput, validateN8nOutput } from "@/server/adapters/contracts";

export interface DispatchInput {
  targetUrl: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  timeoutMs?: number;
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  body: string;
  error?: { code: string; reason: string; retryable: boolean; source: string; adapter: string };
}

async function postWithTimeout(url: string, init: RequestInit, timeoutMs = 12000): Promise<DispatchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    return { ok: response.ok, status: response.status, body: text };
  } finally {
    clearTimeout(timer);
  }
}

export async function dispatchToN8n(input: DispatchInput): Promise<DispatchResult> {
  try {
    return await runWithReliabilityGate(input, {
      adapter: "n8n-execute",
      source: "automation-executor",
      timeoutMs: input.timeoutMs ?? 12000,
      retries: 1,
      validateInput: validateN8nInput,
      validateOutput: validateN8nOutput,
      run: (payload, signal) =>
        postWithTimeout(
          payload.targetUrl,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-openclaw-idempotency-key": payload.idempotencyKey,
            },
            body: JSON.stringify(payload.payload),
            signal,
          },
          payload.timeoutMs ?? 12000,
        ),
      isRetryableError: (error) => {
        const message = String((error as Error)?.message || "").toLowerCase();
        return message.includes("fetch") || message.includes("timeout") || message.includes("aborted");
      },
    });
  } catch (error) {
    if (error instanceof AdapterReliabilityError) {
      return {
        ok: false,
        status: error.details.code === "invalid_input" ? 400 : error.details.code === "timeout" ? 408 : 502,
        body: error.details.reason,
        error: error.details,
      };
    }
    return { ok: false, status: 500, body: String((error as Error)?.message || "n8n adapter failed") };
  }
}
