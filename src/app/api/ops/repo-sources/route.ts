import { NextResponse } from "next/server";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";
import { readRepoSourcesLatestReport } from "@/server/services/repo-sources-report-service";
import {
  buildRepoSourcesOpsReportContent,
  runRepoSourcesRefresh,
  updateRepoSourcesFlags,
  type RepoSourcesOperationScope,
  type RepoSourcesRefreshMode,
} from "@/server/services/repo-sources-ops-service";

export const dynamic = "force-dynamic";

async function writeReportViaBackend(input: {
  req: Request;
  projectId: string;
  title: string;
  content: string;
  category: "maintenance";
  status: "success" | "warning";
  area: string;
  source: string;
  topics: string[];
  metadata: Record<string, unknown>;
}) {
  const reportReq = new Request(input.req.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      category: input.category,
      status: input.status,
      area: input.area,
      source: input.source,
      topics: input.topics,
      metadata: input.metadata,
    }),
  });

  return proxyBackendRequest({
    req: reportReq,
    projectId: input.projectId,
    path: "/reports",
  });
}

export async function GET(req: Request) {
  try {
    await resolveUserContext();
    const snapshot = readRepoSourcesLatestReport({ maxAgeHours: 24 });
    if (!snapshot.available) {
      return NextResponse.json(
        {
          ok: false,
          msg: "Repo sources latest report not found.",
          nextCommand: "npm run ops:repo-sources:check -- --fetch",
        },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view");

    if (view === "blocked") {
      return NextResponse.json({
        ok: snapshot.summary.blocked === 0,
        generatedAt: snapshot.generatedAt,
        summary: snapshot.summary,
        countsByState: snapshot.countsByState,
        blockedCount: snapshot.blockedEntries.length,
        blockedEntries: snapshot.blockedEntries,
      });
    }

    return NextResponse.json({
      ok: true,
      ...snapshot,
    });
  } catch (error) {
    return serverError(
      error,
      "Repo sources ops fetch error",
      "Failed to load repo sources operational status.",
    );
  }
}

type RepoSourcesRefreshPayload = {
  action?: "refresh" | "set_flags";
  mode?: RepoSourcesRefreshMode;
  scope?: RepoSourcesOperationScope;
  targetPath?: string;
  set?: {
    track?: boolean;
    enabled?: boolean;
  };
};

export async function POST(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const controlPlaneProjectId = getControlPlaneProjectId();

    const body = (await req.json().catch(() => ({}))) as RepoSourcesRefreshPayload;
    const action = body.action === "set_flags" ? "set_flags" : "refresh";

    if (action === "set_flags") {
      const targetPath = String(body.targetPath || "").trim().replace(/\\/g, "/");
      const setTrack = body.set && Object.prototype.hasOwnProperty.call(body.set, "track")
        ? Boolean(body.set.track)
        : undefined;
      const setEnabled = body.set && Object.prototype.hasOwnProperty.call(body.set, "enabled")
        ? Boolean(body.set.enabled)
        : undefined;

      const result = updateRepoSourcesFlags(project.rootPath, {
        repoPath: targetPath,
        track: setTrack,
        enabled: setEnabled,
        maxAgeHours: 24,
      });

      void writeReportViaBackend({
        req,
        projectId: controlPlaneProjectId,
        title: `Repo sources flags updated${result.entry ? `: ${result.entry.path}` : ""}`,
        content: [
          `action: set_flags`,
          `targetPath: ${targetPath || "(missing)"}`,
          `track: ${setTrack === undefined ? "(unchanged)" : String(setTrack)}`,
          `enabled: ${setEnabled === undefined ? "(unchanged)" : String(setEnabled)}`,
          `busy: ${result.busy}`,
          `durationMs: ${result.durationMs}`,
          `blocked: ${result.snapshot.summary.blocked}`,
          `updates: ${result.snapshot.summary.updateAvailable}`,
        ].join("\n"),
        category: "maintenance",
        status: result.ok ? "success" : "warning",
        area: "runtime-reliability",
        source: "Mission Control",
        topics: ["repo-sources", "ops", "config"],
        metadata: {
          action: "set_flags",
          targetPath,
          track: setTrack,
          enabled: setEnabled,
          busy: result.busy,
          snapshot: result.snapshot,
        },
      }).catch((error) => {
        console.error("Repo sources report write failed:", error);
      });

      return NextResponse.json(
        {
          ok: result.ok,
          action: "set_flags",
          command: result.command,
          durationMs: result.durationMs,
          busy: result.busy,
          entry: result.entry,
          snapshot: result.snapshot,
        },
        { status: result.ok ? 200 : result.busy ? 423 : 500 },
      );
    }

    const mode: RepoSourcesRefreshMode = body.mode === "update" ? "update" : "check";
    const scope: RepoSourcesOperationScope = body.scope === "single" ? "single" : "all";
    const result = runRepoSourcesRefresh(project.rootPath, {
      mode,
      scope,
      targetPath: body.targetPath,
      maxAgeHours: 24,
    });

    void writeReportViaBackend({
        req,
      projectId: controlPlaneProjectId,
      title: `Repo sources ${mode} ${scope === "single" ? "single" : "all"}`,
      content: buildRepoSourcesOpsReportContent({
        mode: result.mode,
        scope: result.scope,
        targetPath: result.targetPath,
        command: result.command,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        snapshot: result.snapshot,
        stderr: result.stderr,
      }),
      category: "maintenance",
      status: result.ok ? "success" : "warning",
      area: "runtime-reliability",
      source: "Mission Control",
      topics: ["repo-sources", "ops", mode, scope],
      metadata: {
        action: "refresh",
        mode: result.mode,
        scope: result.scope,
        targetPath: result.targetPath,
        command: result.command,
        exitCode: result.exitCode,
        busy: result.busy,
        snapshot: result.snapshot,
      },
    }).catch((error) => {
      console.error("Repo sources report write failed:", error);
    });

    return NextResponse.json(
      {
        ok: result.ok,
        action: "refresh",
        mode: result.mode,
        scope: result.scope,
        targetPath: result.targetPath,
        command: result.command,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        snapshot: result.snapshot,
        busy: result.busy,
      },
      { status: result.ok ? 200 : result.busy ? 423 : 500 },
    );
  } catch (error) {
    return serverError(
      error,
      "Repo sources ops refresh error",
      "Failed to run repo sources refresh from dashboard.",
    );
  }
}
