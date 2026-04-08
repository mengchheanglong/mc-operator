import { resolveUserContext } from "@/server/context/user-context";
import { listDocs } from "@/server/repositories/docs-repo";
import {
  clearDocDerivedContextCache,
  collectDocDerivedContext,
} from "@/server/services/context-pack-service";
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

function mainParitySummary(
  derived: ReturnType<typeof collectDocDerivedContext>,
) {
  return {
    docsById: derived.docsById.size,
    docSearchIndex: derived.docSearchIndex.length,
    unresolvedMaps: derived.graphData.unresolvedMap.size,
    graphNodes: derived.docAnalysis.health.docCount,
  };
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const { id: userId } = await resolveUserContext();
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  const docs = listDocs(userId, project.id);
  const uncachedRuns: BenchmarkRun[] = [];
  let uncachedParity: ReturnType<typeof mainParitySummary> | null = null;

  for (let index = 0; index < iterations; index += 1) {
    clearDocDerivedContextCache(userId, project.id);
    const started = performance.now();
    const derived = collectDocDerivedContext(userId, project.id, docs);
    uncachedRuns.push({ ms: performance.now() - started });
    if (!uncachedParity) {
      uncachedParity = mainParitySummary(derived);
    }
  }

  clearDocDerivedContextCache(userId, project.id);
  const warmed = collectDocDerivedContext(userId, project.id, docs);
  const cachedRuns: BenchmarkRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    collectDocDerivedContext(userId, project.id, docs);
    cachedRuns.push({ ms: performance.now() - started });
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
              JSON.stringify(uncachedParity) ===
                JSON.stringify(mainParitySummary(warmed)),
          ),
          counts: mainParitySummary(warmed),
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
