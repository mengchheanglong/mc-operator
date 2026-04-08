import {
  invokeDesloppifyPrototypeForRun,
  type DesloppifyFailureClass,
} from "./run-scoped-desloppify-service.ts";

export type ToolingAuditFailureClass =
  | "invalid_input"
  | "timeout"
  | "execution_failed";

export interface ToolingAuditResult {
  ok: boolean;
  runId: string;
  canonicalToolId: "desloppify-prototype";
  deprecated: true;
  dispatchId: string;
  artifactPath: string;
  reportId: string | null;
  reportHref: string | null;
  durationMs: number;
  failureClass: ToolingAuditFailureClass | null;
  status: "success" | "error";
  redirectedToolId: "desloppify-prototype";
}

function mapFailureClassFromDesloppify(
  value: DesloppifyFailureClass | null,
): ToolingAuditFailureClass | null {
  if (!value) return null;
  if (value === "timeout") return "timeout";
  if (value === "invalid_input") return "invalid_input";
  return "execution_failed";
}

export async function invokeToolingAuditForRun(input: {
  userId: string;
  projectId: string;
  runId: string;
  timeoutMs?: number;
  scriptPath?: string;
}): Promise<ToolingAuditResult> {
  const redirected = await invokeDesloppifyPrototypeForRun({
    userId: input.userId,
    projectId: input.projectId,
    runId: input.runId,
    timeoutMs: input.timeoutMs,
  });

  return {
    ok: redirected.ok,
    runId: redirected.runId,
    canonicalToolId: "desloppify-prototype",
    deprecated: true,
    dispatchId: redirected.dispatchId,
    artifactPath: redirected.artifactPath,
    reportId: redirected.reportId,
    reportHref: redirected.reportHref,
    durationMs: redirected.durationMs,
    failureClass: mapFailureClassFromDesloppify(redirected.failureClass),
    status: redirected.status,
    redirectedToolId: "desloppify-prototype",
  };
}
