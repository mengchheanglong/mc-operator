export interface NormalizedAdapterError {
  code: string;
  reason: string;
  retryable: boolean;
  source: string;
  adapter: string;
}

export class AdapterReliabilityError extends Error {
  readonly details: NormalizedAdapterError;

  constructor(details: NormalizedAdapterError) {
    super(details.reason);
    this.name = "AdapterReliabilityError";
    this.details = details;
  }
}

interface ReliabilityGateConfig<TInput, TOutput> {
  adapter: string;
  source: string;
  timeoutMs: number;
  retries: number;
  validateInput: (input: TInput) => string[];
  validateOutput: (output: TOutput) => string[];
  run: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
  isRetryableError?: (error: unknown) => boolean;
  mapErrorCode?: (error: unknown) => string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "adapter execution failed");
}

export async function runWithReliabilityGate<TInput, TOutput>(
  input: TInput,
  config: ReliabilityGateConfig<TInput, TOutput>,
): Promise<TOutput> {
  const inputIssues = config.validateInput(input);
  if (inputIssues.length) {
    throw new AdapterReliabilityError({
      code: "invalid_input",
      reason: inputIssues.join("; "),
      retryable: false,
      source: config.source,
      adapter: config.adapter,
    });
  }

  const maxAttempts = Math.max(1, Math.floor(config.retries) + 1);
  let lastError: AdapterReliabilityError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
      });
      const output = await Promise.race([config.run(input, controller.signal), timeoutPromise]);
      const outputIssues = config.validateOutput(output);
      if (outputIssues.length) {
        throw new AdapterReliabilityError({
          code: "invalid_output",
          reason: outputIssues.join("; "),
          retryable: false,
          source: config.source,
          adapter: config.adapter,
        });
      }
      return output;
    } catch (error) {
      const timeout = controller.signal.aborted;
      const retryable = timeout || Boolean(config.isRetryableError?.(error));
      const mapped = error instanceof AdapterReliabilityError
        ? error.details
        : {
            code: timeout ? "timeout" : config.mapErrorCode?.(error) || "execution_failed",
            reason: toErrorMessage(error),
            retryable,
            source: config.source,
            adapter: config.adapter,
          };

      lastError = new AdapterReliabilityError(mapped);
      if (!mapped.retryable || attempt >= maxAttempts) break;
      await sleep(Math.min(1500, attempt * 250));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError) throw lastError;
  throw new AdapterReliabilityError({
    code: "execution_failed",
    reason: "adapter execution failed",
    retryable: false,
    source: config.source,
    adapter: config.adapter,
  });
}
