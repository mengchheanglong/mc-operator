import { resolveUserContext } from "@/server/context/user-context";
import {
  clearDocListCache,
  listDocs,
} from "@/server/repositories/docs-repo";
import {
  clearNoteListCache,
  listNotes,
} from "@/server/repositories/notes-repo";
import {
  clearQuestListCache,
  listQuests,
} from "@/server/repositories/quests-repo";
import {
  clearReportListCache,
  listReports,
} from "@/server/repositories/reports-repo";
import {
  clearDailyReportLogCache,
  listDailyReportLogs,
} from "@/server/services/daily-report-log-service";
import { buildPromotionCandidateSnapshot } from "@/server/services/promotion-candidate-service";
import {
  buildCollaborationGuide,
  buildRepoSnapshot,
  buildWorkspaceReadiness,
  clearCodeGraphContextSnapshotCache,
  clearCodeIntelSnapshotCache,
  clearGitSnapshotCache,
  clearRepoSnapshotCache,
  clearRepoStaticSurfacesCache,
} from "@/server/services/workspace-intel-service";
import {
  collectBoundedCodegraphSummaryWithGate,
  isCodegraphSpikeBoundedModeEnabled,
} from "@/server/services/codegraph-summary-service";
import { buildN8nAutomationSnapshot } from "@/server/services/n8n-service";
import {
  buildContextPack,
  clearDocDerivedContextCache,
  collectDocDerivedContext,
} from "@/server/services/context-pack-service";
import {
  findWorkspaceProject,
  getControlPlaneProjectId,
} from "@/server/projects/workspace-projects";

type BenchmarkPhaseRun = {
  loadDataMs: number;
  graphPrepMs: number;
  repoSnapshotMs: number;
  asyncSurfacesMs: number;
  readinessMs: number;
  memoryPromotionMs: number;
  totalBuildContextPackMs: number;
  measuredSubtotalMs: number;
  residualMs: number;
};

type DocRecord = ReturnType<typeof listDocs>[number];

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildMemoryBriefLite(
  docs: DocRecord[],
  dailyLogs: ReturnType<typeof listDailyReportLogs>,
) {
  const durableDocs = docs
    .filter((doc) => {
      const haystack = `${doc.title} ${doc.tags.join(" ")}`.toLowerCase();
      return [
        "charter",
        "workflow",
        "definition of done",
        "architecture",
        "system",
        "context",
        "guide",
      ].some((keyword) => haystack.includes(keyword));
    })
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .slice(0, 4);

  const recentLogs = dailyLogs.slice(0, 3);
  return {
    durableDocs: durableDocs.length,
    recentLogs: recentLogs.length,
  };
}

async function collectAsyncSurfaces(project: ReturnType<typeof findWorkspaceProject>) {
  return Promise.all([
    isCodegraphSpikeBoundedModeEnabled()
      ? collectBoundedCodegraphSummaryWithGate(project!)
      : Promise.resolve({
          block: undefined,
          reason: "bounded mode disabled",
          reasonCode: "bounded_disabled",
        }),
    buildN8nAutomationSnapshot(project!),
  ]);
}

function clearContextPackPhaseCaches(userId: string, projectId: string, projectRoot: ReturnType<typeof findWorkspaceProject>) {
  clearQuestListCache(userId, projectId);
  clearReportListCache(userId, projectId);
  clearDocListCache(userId, projectId);
  clearNoteListCache(userId, projectId);
  clearDailyReportLogCache(userId, projectId);
  clearDocDerivedContextCache(userId, projectId);
  clearRepoSnapshotCache(projectRoot!);
  clearGitSnapshotCache(projectRoot!);
  clearRepoStaticSurfacesCache(projectRoot!);
  clearCodeIntelSnapshotCache(projectRoot!);
  clearCodeGraphContextSnapshotCache(projectRoot!);
}

async function warmContextPackPhaseCaches(
  userId: string,
  project: NonNullable<ReturnType<typeof findWorkspaceProject>>,
) {
  const quests = listQuests(userId, project.id, { limit: 16 });
  const reports = listReports(userId, project.id, { limit: 6 });
  const docs = listDocs(userId, project.id);
  listNotes(userId, project.id);
  const dailyLogs = listDailyReportLogs(userId, project.id, {
    materializeFiles: false,
    includeContent: false,
  });
  collectDocDerivedContext(userId, project.id, docs);
  const repoSnapshot = buildRepoSnapshot(project);
  await collectAsyncSurfaces(project);
  const readiness = buildWorkspaceReadiness(userId, project, {
    assumeContextFiles: true,
    preloaded: {
      docs,
      quests,
      reports,
      repoSnapshot,
    },
  });
  buildCollaborationGuide(readiness, project);
  buildMemoryBriefLite(docs, dailyLogs);
  buildPromotionCandidateSnapshot(docs, dailyLogs);
}

async function runOnce(cacheMode: "cold" | "warm") {
  const { id: userId } = await resolveUserContext();
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  clearContextPackPhaseCaches(userId, project.id, project);
  if (cacheMode === "warm") {
    await warmContextPackPhaseCaches(userId, project);
    clearRepoSnapshotCache(project);
  }

  const loadDataStarted = performance.now();
  const quests = listQuests(userId, project.id, { limit: 16 });
  const reports = listReports(userId, project.id, { limit: 6 });
  const docs = listDocs(userId, project.id);
  const notes = listNotes(userId, project.id);
  const dailyLogs = listDailyReportLogs(userId, project.id, {
    materializeFiles: false,
    includeContent: false,
  });
  const loadDataMs = performance.now() - loadDataStarted;

  const graphPrepStarted = performance.now();
  const derived = collectDocDerivedContext(userId, project.id, docs);
  const graphPrepMs = performance.now() - graphPrepStarted;

  const repoSnapshotStarted = performance.now();
  const repoSnapshot = buildRepoSnapshot(project);
  const repoSnapshotMs = performance.now() - repoSnapshotStarted;

  const asyncStarted = performance.now();
  await collectAsyncSurfaces(project);
  const asyncSurfacesMs = performance.now() - asyncStarted;

  const readinessStarted = performance.now();
  const readiness = buildWorkspaceReadiness(userId, project, {
    assumeContextFiles: true,
    preloaded: {
      docs,
      quests,
      reports,
      repoSnapshot,
    },
  });
  buildCollaborationGuide(readiness, project);
  const readinessMs = performance.now() - readinessStarted;

  const memoryPromotionStarted = performance.now();
  buildMemoryBriefLite(docs, dailyLogs);
  buildPromotionCandidateSnapshot(docs, dailyLogs);
  const memoryPromotionMs = performance.now() - memoryPromotionStarted;

  const totalStarted = performance.now();
  await buildContextPack(userId, project, {
    focusType: "workspace",
    tier: "overview",
  });
  const totalBuildContextPackMs = performance.now() - totalStarted;

  const measuredSubtotalMs =
    loadDataMs +
    graphPrepMs +
    repoSnapshotMs +
    asyncSurfacesMs +
    readinessMs +
    memoryPromotionMs;

  return {
    loadDataMs,
    graphPrepMs,
    repoSnapshotMs,
    asyncSurfacesMs,
    readinessMs,
    memoryPromotionMs,
    totalBuildContextPackMs,
    measuredSubtotalMs,
    residualMs: totalBuildContextPackMs - measuredSubtotalMs,
    counts: {
      docs: docs.length,
      quests: quests.length,
      notes: notes.length,
      reports: reports.length,
      dailyLogs: dailyLogs.length,
      docsById: derived.docsById.size,
      docSearchIndex: derived.docSearchIndex.length,
      unresolvedMaps: derived.graphData.unresolvedMap.size,
      graphNodes: derived.docAnalysis.health.docCount,
    },
    readiness: {
      score: readiness.score,
      status: readiness.status,
    },
  };
}

function summarizeRuns(runs: BenchmarkPhaseRun[]) {
  return {
    loadDataMs: Number(average(runs.map((run) => run.loadDataMs)).toFixed(2)),
    graphPrepMs: Number(average(runs.map((run) => run.graphPrepMs)).toFixed(2)),
    repoSnapshotMs: Number(average(runs.map((run) => run.repoSnapshotMs)).toFixed(2)),
    asyncSurfacesMs: Number(average(runs.map((run) => run.asyncSurfacesMs)).toFixed(2)),
    readinessMs: Number(average(runs.map((run) => run.readinessMs)).toFixed(2)),
    memoryPromotionMs: Number(
      average(runs.map((run) => run.memoryPromotionMs)).toFixed(2),
    ),
    totalBuildContextPackMs: Number(
      average(runs.map((run) => run.totalBuildContextPackMs)).toFixed(2),
    ),
    measuredSubtotalMs: Number(
      average(runs.map((run) => run.measuredSubtotalMs)).toFixed(2),
    ),
    residualMs: Number(average(runs.map((run) => run.residualMs)).toFixed(2)),
  };
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const coldRuns: BenchmarkPhaseRun[] = [];
  const warmRuns: BenchmarkPhaseRun[] = [];
  let lastMeta:
    | {
        counts: Record<string, number>;
        readiness: { score: number; status: string };
      }
    | undefined;

  for (let index = 0; index < iterations; index += 1) {
    const coldRun = await runOnce("cold");
    coldRuns.push({
      loadDataMs: coldRun.loadDataMs,
      graphPrepMs: coldRun.graphPrepMs,
      repoSnapshotMs: coldRun.repoSnapshotMs,
      asyncSurfacesMs: coldRun.asyncSurfacesMs,
      readinessMs: coldRun.readinessMs,
      memoryPromotionMs: coldRun.memoryPromotionMs,
      totalBuildContextPackMs: coldRun.totalBuildContextPackMs,
      measuredSubtotalMs: coldRun.measuredSubtotalMs,
      residualMs: coldRun.residualMs,
    });

    const warmRun = await runOnce("warm");
    warmRuns.push({
      loadDataMs: warmRun.loadDataMs,
      graphPrepMs: warmRun.graphPrepMs,
      repoSnapshotMs: warmRun.repoSnapshotMs,
      asyncSurfacesMs: warmRun.asyncSurfacesMs,
      readinessMs: warmRun.readinessMs,
      memoryPromotionMs: warmRun.memoryPromotionMs,
      totalBuildContextPackMs: warmRun.totalBuildContextPackMs,
      measuredSubtotalMs: warmRun.measuredSubtotalMs,
      residualMs: warmRun.residualMs,
    });

    lastMeta = {
      counts: warmRun.counts,
      readiness: warmRun.readiness,
    };
  }

  console.log(
    JSON.stringify(
      {
        iterations,
        counts: lastMeta?.counts,
        readiness: lastMeta?.readiness,
        coldAverages: summarizeRuns(coldRuns),
        warmAverages: summarizeRuns(warmRuns),
        coldRuns,
        warmRuns,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
