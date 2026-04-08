import { resolveUserContext } from "@/server/context/user-context";
import {
  buildRepoSnapshot,
  buildWorkspaceReadiness,
} from "@/server/services/workspace-intel-service";
import { listDocs } from "@/server/repositories/docs-repo";
import { listQuests } from "@/server/repositories/quests-repo";
import { listReports } from "@/server/repositories/reports-repo";
import {
  findWorkspaceProject,
  getControlPlaneProjectId,
} from "@/server/projects/workspace-projects";

type BenchmarkRun = {
  ms: number;
};

function averageMs(runs: BenchmarkRun[]) {
  return runs.reduce((sum, run) => sum + run.ms, 0) / runs.length;
}

async function loadBenchmarkContext() {
  const { id: userId } = await resolveUserContext();
  const project = findWorkspaceProject(getControlPlaneProjectId());

  if (!project) {
    throw new Error("control plane project not found");
  }

  const docs = listDocs(userId, project.id);
  const quests = listQuests(userId, project.id);
  const reports = listReports(userId, project.id, { limit: 12 });
  const repoSnapshot = buildRepoSnapshot(project);

  return {
    userId,
    project,
    docs,
    quests,
    reports,
    repoSnapshot,
  };
}

function compareReadiness(
  left: ReturnType<typeof buildWorkspaceReadiness>,
  right: ReturnType<typeof buildWorkspaceReadiness>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const context = await loadBenchmarkContext();

  const baselineReadiness = buildWorkspaceReadiness(context.userId, context.project, {
    assumeContextFiles: true,
  });
  const reusedReadiness = buildWorkspaceReadiness(context.userId, context.project, {
    assumeContextFiles: true,
    preloaded: {
      docs: context.docs,
      quests: context.quests,
      reports: context.reports,
      repoSnapshot: context.repoSnapshot,
    },
  });

  if (!compareReadiness(baselineReadiness, reusedReadiness)) {
    throw new Error("preloaded readiness diverged from baseline readiness");
  }

  const duplicateRuns: BenchmarkRun[] = [];
  const reusedRuns: BenchmarkRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const duplicateStarted = performance.now();
    buildWorkspaceReadiness(context.userId, context.project, {
      assumeContextFiles: true,
    });
    duplicateRuns.push({ ms: performance.now() - duplicateStarted });

    const reusedStarted = performance.now();
    buildWorkspaceReadiness(context.userId, context.project, {
      assumeContextFiles: true,
      preloaded: {
        docs: context.docs,
        quests: context.quests,
        reports: context.reports,
        repoSnapshot: context.repoSnapshot,
      },
    });
    reusedRuns.push({ ms: performance.now() - reusedStarted });
  }

  const duplicateAvg = averageMs(duplicateRuns);
  const reusedAvg = averageMs(reusedRuns);

  console.log(
    JSON.stringify(
      {
        projectId: context.project.id,
        iterations,
        docsCount: context.docs.length,
        questCount: context.quests.length,
        reportCount: context.reports.length,
        parity: {
          ok: true,
          score: baselineReadiness.score,
          status: baselineReadiness.status,
        },
        duplicateRuns,
        reusedRuns,
        duplicateAvgMs: Number(duplicateAvg.toFixed(2)),
        reusedAvgMs: Number(reusedAvg.toFixed(2)),
        deltaMs: Number((reusedAvg - duplicateAvg).toFixed(2)),
        improvementPercent: Number(
          (((duplicateAvg - reusedAvg) / duplicateAvg) * 100).toFixed(1),
        ),
        note:
          "The reused path assumes docs, quests, reports, and repo snapshot were already loaded earlier in buildContextPack and measures the duplicate-read cost avoided inside buildWorkspaceReadiness.",
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
