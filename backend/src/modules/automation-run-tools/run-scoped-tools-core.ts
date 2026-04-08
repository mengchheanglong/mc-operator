export const RUN_SCOPED_TOOL_ALLOWLIST = [
  "tooling-audit",
  "desloppify-prototype",
  "agency-agents",
] as const;

export type RunScopedToolId = (typeof RUN_SCOPED_TOOL_ALLOWLIST)[number];

const RUN_SCOPED_TOOL_CANONICAL_MAP: Record<RunScopedToolId, RunScopedToolId> =
  {
    "tooling-audit": "desloppify-prototype",
    "desloppify-prototype": "desloppify-prototype",
    "agency-agents": "agency-agents",
  };

export interface RunScopedToolingResultLike {
  runId: string;
  status: "success" | "error";
  failureClass: string | null;
  durationMs: number;
  dispatchId: string;
  artifactPath: string;
  reportId: string | null;
  reportHref: string | null;
  precheck?: {
    minChars: number;
    actualChars: number;
    triggered: boolean;
  };
}

export interface RunScopedToolDispatchLike {
  metadata?: Record<string, unknown>;
}

export interface RunScopedToolInvocationResult {
  toolId: RunScopedToolId;
  canonicalToolId: RunScopedToolId;
  deprecated: boolean;
  runId: string;
  status: "success" | "error";
  failureClass: string | null;
  durationMs: number;
  dispatchId: string;
  artifactPath: string;
  reportId: string | null;
  reportHref: string | null;
  runContext: {
    runId: string;
    worktreePath: string | null;
  };
  precheck?: {
    minChars: number;
    actualChars: number;
    triggered: boolean;
  };
}

export function resolveRunScopedToolId(value: unknown): RunScopedToolId {
  const toolId = String(value ?? "").trim();
  const allowlist = RUN_SCOPED_TOOL_ALLOWLIST as readonly string[];
  if (allowlist.includes(toolId)) return toolId as RunScopedToolId;
  throw new Error(
    `invalid_input: unsupported toolId=${
      toolId || "(empty)"
    }; allowed=${allowlist.join(",")}`,
  );
}

export function resolveCanonicalRunScopedToolId(
  toolId: RunScopedToolId,
): RunScopedToolId {
  return RUN_SCOPED_TOOL_CANONICAL_MAP[toolId] ?? toolId;
}

export function isDeprecatedRunScopedTool(toolId: RunScopedToolId): boolean {
  return resolveCanonicalRunScopedToolId(toolId) !== toolId;
}

export function normalizeRunScopedToolInvocation(input: {
  toolId: RunScopedToolId;
  result: RunScopedToolingResultLike;
  dispatch: RunScopedToolDispatchLike | null | undefined;
}): RunScopedToolInvocationResult {
  const metadata = (input.dispatch?.metadata || {}) as Record<string, unknown>;
  const runContext = (metadata.runContext || {}) as Record<string, unknown>;
  const precheck =
    input.result.precheck ||
    (metadata.precheck as RunScopedToolInvocationResult["precheck"] | undefined);
  const canonicalToolId = resolveCanonicalRunScopedToolId(input.toolId);

  return {
    toolId: input.toolId,
    canonicalToolId,
    deprecated: canonicalToolId !== input.toolId,
    runId: input.result.runId,
    status: input.result.status,
    failureClass: input.result.failureClass,
    durationMs: input.result.durationMs,
    dispatchId: input.result.dispatchId,
    artifactPath: input.result.artifactPath,
    reportId: input.result.reportId,
    reportHref: input.result.reportHref,
    runContext: {
      runId: String(runContext.runId || input.result.runId),
      worktreePath: runContext.worktreePath
        ? String(runContext.worktreePath)
        : null,
    },
    precheck: precheck
      ? {
          minChars: Number(precheck.minChars || 0),
          actualChars: Number(precheck.actualChars || 0),
          triggered: Boolean(precheck.triggered),
        }
      : undefined,
  };
}
