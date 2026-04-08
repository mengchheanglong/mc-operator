import {
  buildRepoSnapshot,
  clearCodeGraphContextCliHealthCache,
  clearCodeGraphContextSnapshotCache,
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

function clearProjectCaches(project: ReturnType<typeof findWorkspaceProject>) {
  clearRepoSnapshotCache(project!);
  clearGitSnapshotCache(project!);
  clearRepoStaticSurfacesCache(project!);
  clearCodeGraphContextSnapshotCache(project!);
}

function paritySummary(snapshot: ReturnType<typeof buildRepoSnapshot>) {
  return {
    summary: snapshot.summary,
    codeGraphContextStatus: snapshot.codeIntel.codeGraphContext.status,
    codeGraphContextSource: snapshot.codeIntel.codeGraphContext.source,
    codeGraphContextLastError: snapshot.codeIntel.codeGraphContext.lastError,
    codeGraphContextIndexed: snapshot.codeIntel.codeGraphContext.indexed,
  };
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  const baselineRuns: BenchmarkRun[] = [];
  let baselineParity: ReturnType<typeof paritySummary> | null = null;

  for (let index = 0; index < iterations; index += 1) {
    clearProjectCaches(project);
    clearCodeGraphContextCliHealthCache();
    const started = performance.now();
    const snapshot = buildRepoSnapshot(project);
    baselineRuns.push({ ms: performance.now() - started });
    if (!baselineParity) {
      baselineParity = paritySummary(snapshot);
    }
  }

  clearProjectCaches(project);
  clearCodeGraphContextCliHealthCache();
  const primedSnapshot = buildRepoSnapshot(project);
  const primedParity = paritySummary(primedSnapshot);
  const reusedRuns: BenchmarkRun[] = [];
  let reusedParity: ReturnType<typeof paritySummary> | null = null;

  for (let index = 0; index < iterations; index += 1) {
    clearProjectCaches(project);
    const started = performance.now();
    const snapshot = buildRepoSnapshot(project);
    reusedRuns.push({ ms: performance.now() - started });
    if (!reusedParity) {
      reusedParity = paritySummary(snapshot);
    }
  }

  const baselineAvgMs = averageMs(baselineRuns);
  const reusedAvgMs = averageMs(reusedRuns);
  const deltaMs = reusedAvgMs - baselineAvgMs;
  const improvementPercent =
    baselineAvgMs > 0 ? ((baselineAvgMs - reusedAvgMs) / baselineAvgMs) * 100 : 0;

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        iterations,
        parity: {
          ok: Boolean(
            baselineParity &&
              reusedParity &&
              JSON.stringify(baselineParity) === JSON.stringify(reusedParity),
          ),
          baseline: baselineParity,
          primed: primedParity,
          reused: reusedParity,
        },
        baselineRuns,
        reusedRuns,
        baselineAvgMs: Number(baselineAvgMs.toFixed(2)),
        reusedAvgMs: Number(reusedAvgMs.toFixed(2)),
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
