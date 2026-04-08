import {
  buildRepoSnapshot,
  clearCodeGraphContextCliHealthCache,
  clearCodeGraphContextSnapshotCache,
  clearCodeIntelSnapshotCache,
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
  clearCodeIntelSnapshotCache(project!);
  clearCodeGraphContextSnapshotCache(project!);
}

function paritySummary(snapshot: ReturnType<typeof buildRepoSnapshot>) {
  return {
    summary: snapshot.summary,
    codeIntelOverallStatus: snapshot.codeIntel.overallStatus,
    codeIntelSummary: snapshot.codeIntel.summary,
    codeIntelToolCount: snapshot.codeIntel.tools.length,
    codeGraphContextStatus: snapshot.codeIntel.codeGraphContext.status,
    codeGraphContextSource: snapshot.codeIntel.codeGraphContext.source,
    codeGraphContextLastError: snapshot.codeIntel.codeGraphContext.lastError,
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
  buildRepoSnapshot(project);
  const warmedRuns: BenchmarkRun[] = [];
  let warmedParity: ReturnType<typeof paritySummary> | null = null;

  for (let index = 0; index < iterations; index += 1) {
    clearRepoSnapshotCache(project);
    clearGitSnapshotCache(project);
    clearRepoStaticSurfacesCache(project);
    clearCodeGraphContextSnapshotCache(project);
    const started = performance.now();
    const snapshot = buildRepoSnapshot(project);
    warmedRuns.push({ ms: performance.now() - started });
    if (!warmedParity) {
      warmedParity = paritySummary(snapshot);
    }
  }

  const baselineAvgMs = averageMs(baselineRuns);
  const warmedAvgMs = averageMs(warmedRuns);
  const deltaMs = warmedAvgMs - baselineAvgMs;
  const improvementPercent =
    baselineAvgMs > 0 ? ((baselineAvgMs - warmedAvgMs) / baselineAvgMs) * 100 : 0;

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        iterations,
        parity: {
          ok: Boolean(
            baselineParity &&
              warmedParity &&
              JSON.stringify(baselineParity) === JSON.stringify(warmedParity),
          ),
          summary: warmedParity,
        },
        baselineRuns,
        warmedRuns,
        baselineAvgMs: Number(baselineAvgMs.toFixed(2)),
        warmedAvgMs: Number(warmedAvgMs.toFixed(2)),
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
