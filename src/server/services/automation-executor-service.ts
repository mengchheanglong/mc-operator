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
  return postWithTimeout(
    input.targetUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openclaw-idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify(input.payload),
    },
    input.timeoutMs ?? 12000,
  );
}
