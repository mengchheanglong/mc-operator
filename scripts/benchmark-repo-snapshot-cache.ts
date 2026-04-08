import {
  findWorkspaceProject,
  getControlPlaneProjectId,
} from "@/server/projects/workspace-projects";
import {
  buildRepoSnapshot,
  clearCodeGraphContextSnapshotCache,
  clearRepoSnapshotCache,
} from "@/server/services/workspace-intel-service";

type BenchmarkRun = {
  ms: number;
};

function averageMs(runs: BenchmarkRun[]) {
  return runs.reduce((sum, run) => sum + run.ms, 0) / runs.length;
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  clearRepoSnapshotCache(project);
  clearCodeGraphContextSnapshotCache(project);
  const baseline = buildRepoSnapshot(project);

  clearRepoSnapshotCache(project);
  clearCodeGraphContextSnapshotCache(project);
  buildRepoSnapshot(project);

  const uncachedRuns: BenchmarkRun[] = [];
  const cachedRuns: BenchmarkRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    clearRepoSnapshotCache(project);
    clearCodeGraphContextSnapshotCache(project);
    const uncachedStarted = performance.now();
    buildRepoSnapshot(project);
    uncachedRuns.push({ ms: performance.now() - uncachedStarted });

    const cachedStarted = performance.now();
    const cachedSnapshot = buildRepoSnapshot(project);
    cachedRuns.push({ ms: performance.now() - cachedStarted });

    if (JSON.stringify(cachedSnapshot) !== JSON.stringify(buildRepoSnapshot(project))) {
      throw new Error("cached repo snapshot diverged from repeated cached output");
    }
  }

  const uncachedAvg = averageMs(uncachedRuns);
  const cachedAvg = averageMs(cachedRuns);

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        iterations,
        parity: {
          ok: true,
          summary: baseline.summary,
          changedFiles: baseline.git.changedFiles.length,
          codeIntelTools: baseline.codeIntel.tools.length,
        },
        uncachedRuns,
        cachedRuns,
        uncachedAvgMs: Number(uncachedAvg.toFixed(2)),
        cachedAvgMs: Number(cachedAvg.toFixed(2)),
        deltaMs: Number((cachedAvg - uncachedAvg).toFixed(2)),
        improvementPercent: Number(
          (((uncachedAvg - cachedAvg) / uncachedAvg) * 100).toFixed(1),
        ),
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
