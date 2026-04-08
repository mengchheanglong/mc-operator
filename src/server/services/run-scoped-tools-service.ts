import { findLatestWorkspaceRunDispatch } from "../repositories/workspace-run-dispatches-repo.ts";
import { invokeToolingAuditForRun, type ToolingAuditResult } from "./run-scoped-tooling-audit-service.ts";
import { invokeDesloppifyPrototypeForRun, type DesloppifyPrototypeResult } from "./run-scoped-desloppify-service.ts";
import {
  invokeAgencyAgentsForRun,
  type AgencyAgentsRunResult,
} from "./run-scoped-agency-agents-service.ts";
import {
  isDeprecatedRunScopedTool,
  normalizeRunScopedToolInvocation,
  resolveCanonicalRunScopedToolId,
  resolveRunScopedToolId,
} from "./run-scoped-tools-core.ts";

export {
  isDeprecatedRunScopedTool,
  normalizeRunScopedToolInvocation,
  resolveCanonicalRunScopedToolId,
  resolveRunScopedToolId,
} from "./run-scoped-tools-core.ts";
export type { RunScopedToolId, RunScopedToolInvocationResult } from "./run-scoped-tools-core.ts";

export async function invokeRunScopedToolForRun(input: {
  userId: string;
  projectId: string;
  runId: string;
  toolId: unknown;
  timeoutMs?: number;
  minChars?: number;
  content?: string;
  action?: string;
  profile?: string;
  includeDirectories?: string[];
  rollbackSnapshotId?: string;
  dryRun?: boolean;
  writeReport?: boolean;
  reportContext?: string;
}) {
  const toolId = resolveRunScopedToolId(input.toolId);

  let result: ToolingAuditResult | DesloppifyPrototypeResult | AgencyAgentsRunResult;
  switch (toolId) {
    case "tooling-audit":
      result = await invokeToolingAuditForRun({
        userId: input.userId,
        projectId: input.projectId,
        runId: input.runId,
        timeoutMs: input.timeoutMs,
      });
      break;
    case "desloppify-prototype":
      result = await invokeDesloppifyPrototypeForRun({
        userId: input.userId,
        projectId: input.projectId,
        runId: input.runId,
        timeoutMs: input.timeoutMs,
        minChars: input.minChars,
        content: input.content,
      });
      break;
    case "agency-agents":
      result = await invokeAgencyAgentsForRun({
        userId: input.userId,
        projectId: input.projectId,
        runId: input.runId,
        timeoutMs: input.timeoutMs,
        action: input.action === "rollback" ? "rollback" : "sync",
        profile: input.profile,
        includeDirectories: input.includeDirectories,
        rollbackSnapshotId: input.rollbackSnapshotId,
        dryRun: input.dryRun,
        writeReport: input.writeReport,
        reportContext: input.reportContext,
      });
      break;
    default:
      throw new Error(`invalid_input: unsupported toolId=${String(toolId)}`);
  }

  const latestDispatch = findLatestWorkspaceRunDispatch(input.userId, input.projectId, input.runId);
  return normalizeRunScopedToolInvocation({ toolId, result, dispatch: latestDispatch });
}
