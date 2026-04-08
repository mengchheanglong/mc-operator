import {
  buildRepoSnapshot,
  clearGitSnapshotCache,
  clearRepoSnapshotCache,
  clearRepoStaticSurfacesCache,
} from "@/server/services/workspace-intel-service";
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

function clearAllRepoSnapshotCaches(project: ReturnType<typeof findWorkspaceProject>) {
  clearRepoSnapshotCache(project!);
  clearGitSnapshotCache(project!);
  clearRepoStaticSurfacesCache(project!);
}

function paritySummary(snapshot: ReturnType<typeof buildRepoSnapshot>) {
  return {
    summary: snapshot.summary,
    routeCount: snapshot.apiRoutes.length,
    keyFileCount: snapshot.keyFiles.length,
    gitSummary: snapshot.git.summary,
    codeIntelTools: snapshot.codeIntel.tools.length,
  };
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  const uncachedRuns: BenchmarkRun[] = [];
  let uncachedParity: ReturnType<typeof paritySummary> | null = null;

  for (let index = 0; index < iterations; index += 1) {
    clearAllRepoSnapshotCaches(project);
    const started = performance.now();
    const snapshot = buildRepoSnapshot(project);
    uncachedRuns.push({ ms: performance.now() - started });
    if (!uncachedParity) {
      uncachedParity = paritySummary(snapshot);
    }
  }

  clearAllRepoSnapshotCaches(project);
  buildRepoSnapshot(project);
  const cachedRuns: BenchmarkRun[] = [];
  let warmedParity: ReturnType<typeof paritySummary> | null = null;

  for (let index = 0; index < iterations; index += 1) {
    clearRepoSnapshotCache(project);
    const started = performance.now();
    const snapshot = buildRepoSnapshot(project);
    cachedRuns.push({ ms: performance.now() - started });
    if (!warmedParity) {
      warmedParity = paritySummary(snapshot);
    }
  }

  const uncachedAvgMs = averageMs(uncachedRuns);
  const cachedAvgMs = averageMs(cachedRuns);
  const deltaMs = cachedAvgMs - uncachedAvgMs;
  const improvementPercent =
    uncachedAvgMs > 0 ? ((uncachedAvgMs - cachedAvgMs) / uncachedAvgMs) * 100 : 0;

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        iterations,
        parity: {
          ok: Boolean(
            uncachedParity &&
              warmedParity &&
              JSON.stringify(uncachedParity) === JSON.stringify(warmedParity),
          ),
          summary: warmedParity,
        },
        uncachedRuns,
        cachedRuns,
        uncachedAvgMs: Number(uncachedAvgMs.toFixed(2)),
        cachedAvgMs: Number(cachedAvgMs.toFixed(2)),
        deltaMs: Number(deltaMs.toFixed(2)),
        improvementPercent: Number(improvementPercent.toFixed(1)),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
