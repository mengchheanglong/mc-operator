import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findWorkspaceRunById } from "../repositories/workspace-runs-repo.ts";
import { createWorkspaceRunDispatch, updateWorkspaceRunDispatch } from "../repositories/workspace-run-dispatches-repo.ts";
import { createReport, type ReportStatus } from "../repositories/reports-repo.ts";
import { verifyRunWorktreePath } from "./workspace-run-service.ts";
import { resolveDesloppifySourceRoot } from "@/server/paths/directive-source-packs";
import {
  classifyDesloppifyFailure,
  evaluateLengthGate,
  extractJsonPayload,
  normalizeDesloppifyFailureClass,
  runDesloppifyCommand,
  type DesloppifyCommandResult,
  type DesloppifyFailureClass,
  type LengthGateResult,
} from "./run-scoped-desloppify-core.ts";

export {
  classifyDesloppifyFailure,
  evaluateLengthGate,
  extractJsonPayload,
  normalizeDesloppifyFailureClass,
  runDesloppifyCommand,
};
export type { DesloppifyCommandResult, DesloppifyFailureClass, LengthGateResult };

export interface DesloppifyPrototypeResult {
  ok: boolean;
  runId: string;
  dispatchId: string;
  artifactPath: string;
  reportId: string | null;
  reportHref: string | null;
  durationMs: number;
  failureClass: DesloppifyFailureClass | null;
  status: "success" | "error";
  precheck: LengthGateResult;
}

function reportHrefFromDate(date: string) {
  return `/dashboard/report?day=${encodeURIComponent(date.slice(0, 10))}`;
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function summarizeCommand(result: DesloppifyCommandResult | null, parseState: "ok" | "failed" | "skipped") {
  if (!result) return "- skipped";
  return `- command: ${result.command}\n- exitCode: ${result.exitCode}\n- timedOut: ${result.timedOut}\n- durationMs: ${result.durationMs}\n- parse: ${parseState}`;
}

function createDesloppifyReport(input: {
  userId: string;
  projectId: string;
  runId: string;
  dispatchId: string;
  worktreePath: string;
  artifactPath: string;
  status: "success" | "error";
  failureClass: DesloppifyFailureClass | null;
  durationMs: number;
  precheck: LengthGateResult;
  error?: string;
}) {
  const reportStatus: ReportStatus = input.status === "success" ? "success" : "warning";
  const content = [
    "# Run-scoped Desloppify Prototype",
    "",
    `- runId: ${input.runId}`,
    `- dispatchId: ${input.dispatchId}`,
    `- status: ${input.status}`,
    `- failureClass: ${input.failureClass ?? "none"}`,
    `- durationMs: ${input.durationMs}`,
    `- precheck.minChars: ${input.precheck.minChars}`,
    `- precheck.actualChars: ${input.precheck.actualChars}`,
    `- precheck.triggered: ${input.precheck.triggered}`,
    `- artifactPath: ${input.artifactPath}`,
    input.error ? `\n## error\n${input.error}` : "",
  ].join("\n");

  return createReport(input.userId, input.projectId, {
    title: `Run-scoped desloppify prototype: ${input.status}`,
    content,
    category: "maintenance",
    status: reportStatus,
    area: "runtime-reliability",
    source: "Mission Control",
    topics: ["desloppify", "directive-workspace", "workspace-runs"],
    metadata: {
      runContext: {
        runId: input.runId,
        worktreePath: input.worktreePath,
      },
      dispatchId: input.dispatchId,
      artifactPath: input.artifactPath,
      failureClass: input.failureClass,
      durationMs: input.durationMs,
      status: input.status,
      precheck: input.precheck,
    },
  });
}

export async function invokeDesloppifyPrototypeForRun(input: {
  userId: string;
  projectId: string;
  runId: string;
  timeoutMs?: number;
  nextCount?: number;
  minChars?: number;
  content?: string;
  toolRootPath?: string;
}): Promise<DesloppifyPrototypeResult> {
  const timeoutMs = input.timeoutMs ?? 90_000;
  const nextCount = Math.max(1, Math.min(20, Math.floor(Number(input.nextCount ?? 5))));
  const toolRootPath = input.toolRootPath ?? resolveDesloppifySourceRoot();

  const run = findWorkspaceRunById(input.userId, input.projectId, input.runId);
  if (!run || run.status !== "active") {
    throw new Error(`invalid_input: active run not found for runId=${input.runId}`);
  }

  const worktreeExists = await verifyRunWorktreePath(run.worktreePath);
  if (!worktreeExists) {
    throw new Error(`invalid_input: run worktree missing for runId=${input.runId}`);
  }

  const precheck = evaluateLengthGate({ minChars: input.minChars, content: input.content });
  const command = "python -m desloppify scan/status/next (run-scoped prototype)";

  const dispatch = createWorkspaceRunDispatch({
    userId: input.userId,
    projectId: input.projectId,
    runId: input.runId,
    agentId: "desloppify-prototype",
    status: "running",
    command,
    artifactPath: run.worktreePath,
    metadata: {
      source: "slice-e",
      toolPath: "directive-workspace/forge/source-packs/desloppify",
      runContext: { runId: run.id, worktreePath: run.worktreePath },
      precheck,
    },
  });

  const artifactDir = path.resolve(process.cwd(), "reports", "ops");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.resolve(artifactDir, `desloppify-prototype-${input.runId}.md`);

  if (precheck.triggered) {
    const body = [
      "# Run-scoped Desloppify Prototype",
      "",
      "## Phase 0: Precheck Gate",
      `- minChars: ${precheck.minChars}`,
      `- actualChars: ${precheck.actualChars}`,
      "- action: skipped (below threshold)",
    ].join("\n");
    await writeFile(artifactPath, body, "utf8");

    const report = createDesloppifyReport({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.runId,
      dispatchId: dispatch.id,
      worktreePath: run.worktreePath,
      artifactPath,
      status: "success",
      failureClass: null,
      durationMs: 0,
      precheck,
    });

    updateWorkspaceRunDispatch(input.userId, input.projectId, dispatch.id, {
      finishedAt: new Date().toISOString(),
      status: "success",
      failureClass: null,
      artifactPath,
      reportId: report.id,
      metadata: {
        ...(dispatch.metadata || {}),
        skipped: true,
        status: "success",
        runContext: { runId: run.id, worktreePath: run.worktreePath },
      },
    });

    return {
      ok: true,
      runId: input.runId,
      dispatchId: dispatch.id,
      artifactPath,
      reportId: report.id,
      reportHref: reportHrefFromDate(report.date),
      durationMs: 0,
      failureClass: null,
      status: "success",
      precheck,
    };
  }

  try {
    const scanTimeoutMs = Math.max(20_000, Math.floor(timeoutMs * 0.7));
    const statusTimeoutMs = Math.max(10_000, Math.floor(timeoutMs * 0.2));
    const nextTimeoutMs = Math.max(8_000, timeoutMs - scanTimeoutMs - statusTimeoutMs);
    const startedAt = Date.now();

    const scanResult = await runDesloppifyCommand({
      args: ["scan", "--path", run.worktreePath, "--profile", "ci", "--skip-slow", "--no-badge"],
      cwd: run.worktreePath,
      timeoutMs: scanTimeoutMs,
      toolRootPath,
    });

    let statusResult: DesloppifyCommandResult | null = null;
    let statusPayload: unknown = null;
    let nextResult: DesloppifyCommandResult | null = null;
    let nextPayload: unknown = null;

    if (scanResult.exitCode === 0 && !scanResult.timedOut) {
      statusResult = await runDesloppifyCommand({
        args: ["status", "--json"],
        cwd: run.worktreePath,
        timeoutMs: statusTimeoutMs,
        toolRootPath,
      });
      if (statusResult.exitCode === 0 && !statusResult.timedOut) {
        statusPayload = extractJsonPayload(statusResult.stdout);
      }

      nextResult = await runDesloppifyCommand({
        args: ["next", "--count", String(nextCount), "--format", "json"],
        cwd: run.worktreePath,
        timeoutMs: nextTimeoutMs,
        toolRootPath,
      });
      if (nextResult.exitCode === 0 && !nextResult.timedOut) {
        nextPayload = extractJsonPayload(nextResult.stdout);
      }
    }

    const failedResult = [scanResult, statusResult, nextResult].find((entry) => entry && (entry.timedOut || entry.exitCode !== 0)) || null;
    const parseFailed = (statusResult && statusResult.exitCode === 0 && !statusPayload)
      || (nextResult && nextResult.exitCode === 0 && !nextPayload);

    const failureClass = parseFailed
      ? "parse_failed"
      : failedResult
        ? classifyDesloppifyFailure(failedResult)
        : null;
    const status = failureClass ? "error" : "success";
    const durationMs = Date.now() - startedAt;

    const markdown = [
      "# Run-scoped Desloppify Prototype",
      "",
      `- runId: ${input.runId}`,
      `- dispatchId: ${dispatch.id}`,
      `- status: ${status}`,
      `- failureClass: ${failureClass ?? "none"}`,
      `- durationMs: ${durationMs}`,
      "",
      "## Phase 0: Precheck Gate",
      `- minChars: ${precheck.minChars}`,
      `- actualChars: ${precheck.actualChars}`,
      `- triggered: ${precheck.triggered}`,
      "",
      "## Phase 1: scan",
      summarizeCommand(scanResult, "skipped"),
      "",
      "## Phase 2: status --json",
      summarizeCommand(statusResult, statusPayload ? "ok" : statusResult ? "failed" : "skipped"),
      "```json",
      stringifyJson(statusPayload || {}),
      "```",
      "",
      "## Phase 3: next --format json",
      summarizeCommand(nextResult, nextPayload ? "ok" : nextResult ? "failed" : "skipped"),
      "```json",
      stringifyJson(nextPayload || {}),
      "```",
    ].join("\n");
    await writeFile(artifactPath, markdown, "utf8");

    const report = createDesloppifyReport({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.runId,
      dispatchId: dispatch.id,
      worktreePath: run.worktreePath,
      artifactPath,
      status,
      failureClass,
      durationMs,
      precheck,
    });

    updateWorkspaceRunDispatch(input.userId, input.projectId, dispatch.id, {
      finishedAt: new Date().toISOString(),
      status,
      failureClass,
      artifactPath,
      reportId: report.id,
      metadata: {
        ...(dispatch.metadata || {}),
        durationMs,
        precheck,
        phases: {
          scan: scanResult ? { exitCode: scanResult.exitCode, timedOut: scanResult.timedOut } : null,
          status: statusResult ? { exitCode: statusResult.exitCode, timedOut: statusResult.timedOut } : null,
          next: nextResult ? { exitCode: nextResult.exitCode, timedOut: nextResult.timedOut } : null,
        },
        runContext: { runId: run.id, worktreePath: run.worktreePath },
      },
    });

    return {
      ok: status === "success",
      runId: input.runId,
      dispatchId: dispatch.id,
      artifactPath,
      reportId: report.id,
      reportHref: reportHrefFromDate(report.date),
      durationMs,
      failureClass,
      status,
      precheck,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureClass = normalizeDesloppifyFailureClass(error);
    await writeFile(
      artifactPath,
      `# Run-scoped Desloppify Prototype\n\nrunId: ${input.runId}\nstatus: error\nfailureClass: ${failureClass}\n\n${message}\n`,
      "utf8",
    );

    const report = createDesloppifyReport({
      userId: input.userId,
      projectId: input.projectId,
      runId: input.runId,
      dispatchId: dispatch.id,
      worktreePath: run.worktreePath,
      artifactPath,
      status: "error",
      failureClass,
      durationMs: 0,
      precheck,
      error: message,
    });

    updateWorkspaceRunDispatch(input.userId, input.projectId, dispatch.id, {
      finishedAt: new Date().toISOString(),
      status: "error",
      failureClass,
      artifactPath,
      reportId: report.id,
      metadata: {
        ...(dispatch.metadata || {}),
        precheck,
        error: message,
        runContext: { runId: run.id, worktreePath: run.worktreePath },
      },
    });

    return {
      ok: false,
      runId: input.runId,
      dispatchId: dispatch.id,
      artifactPath,
      reportId: report.id,
      reportHref: reportHrefFromDate(report.date),
      durationMs: 0,
      failureClass,
      status: "error",
      precheck,
    };
  }
}
