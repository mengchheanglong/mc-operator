import { resolveUserContext } from "@/server/context/user-context";
import {
  findWorkspaceProject,
  getControlPlaneProjectId,
} from "@/server/projects/workspace-projects";
import {
  buildContextPack,
  loadContextPackPreloadedData,
} from "@/server/services/context-pack-service";
import {
  buildCollaborationGuide,
  buildRepoSnapshot,
  buildWorkspaceReadiness,
} from "@/server/services/workspace-intel-service";

type BenchmarkRun = {
  ms: number;
};

function averageMs(runs: BenchmarkRun[]) {
  return runs.reduce((sum, run) => sum + run.ms, 0) / runs.length;
}

function normalizePack<T extends { timestamp: string }>(pack: T) {
  const normalized = {
    ...pack,
    timestamp: "<normalized>",
  };

  if (
    "codegraph_summary" in normalized &&
    normalized.codegraph_summary &&
    typeof normalized.codegraph_summary === "object"
  ) {
    normalized.codegraph_summary = {
      ...normalized.codegraph_summary,
      compact: {
        ...normalized.codegraph_summary.compact,
        metadata: {
          ...normalized.codegraph_summary.compact.metadata,
          generatedAt: "<normalized>",
        },
      },
    };
  }

  return normalized;
}

function firstDiff(left: unknown, right: unknown, path: string[] = []): {
  path: string[];
  left: unknown;
  right: unknown;
} | null {
  if (Object.is(left, right)) {
    return null;
  }

  if (typeof left !== typeof right) {
    return { path, left, right };
  }

  if (left === null || right === null) {
    return { path, left, right };
  }

  if (typeof left !== "object" || typeof right !== "object") {
    return { path, left, right };
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return { path, left, right };
    }

    if (left.length !== right.length) {
      return {
        path: [...path, "length"],
        left: left.length,
        right: right.length,
      };
    }

    for (let index = 0; index < left.length; index += 1) {
      const diff = firstDiff(left[index], right[index], [...path, String(index)]);
      if (diff) {
        return diff;
      }
    }

    return null;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Array.from(
    new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]),
  ).sort();

  for (const key of keys) {
    if (!(key in leftRecord) || !(key in rightRecord)) {
      return {
        path: [...path, key],
        left: leftRecord[key],
        right: rightRecord[key],
      };
    }

    const diff = firstDiff(leftRecord[key], rightRecord[key], [...path, key]);
    if (diff) {
      return diff;
    }
  }

  return null;
}

async function buildLegacyBundle(userId: string, project: NonNullable<ReturnType<typeof findWorkspaceProject>>) {
  const summaryPack = await buildContextPack(userId, project, {
    focusType: "workspace",
    tier: "summary",
  });
  const workspacePack = await buildContextPack(userId, project, {
    focusType: "workspace",
    tier: "overview",
  });
  const fullPack = await buildContextPack(userId, project, {
    focusType: "workspace",
    tier: "full",
  });
  const readiness = buildWorkspaceReadiness(userId, project, {
    assumeContextFiles: true,
  });
  const collaborationGuide = buildCollaborationGuide(readiness, project);
  const repoSnapshot = buildRepoSnapshot(project);

  return {
    summaryPack,
    workspacePack,
    fullPack,
    readiness,
    collaborationGuide,
    repoSnapshot,
  };
}

async function buildPreloadedBundle(userId: string, project: NonNullable<ReturnType<typeof findWorkspaceProject>>) {
  const preloaded = await loadContextPackPreloadedData(userId, project);
  const summaryPack = await buildContextPack(userId, project, {
    focusType: "workspace",
    tier: "summary",
    preloaded,
  });
  const workspacePack = await buildContextPack(userId, project, {
    focusType: "workspace",
    tier: "overview",
    preloaded,
  });
  const fullPack = await buildContextPack(userId, project, {
    focusType: "workspace",
    tier: "full",
    preloaded,
  });
  const readiness = buildWorkspaceReadiness(userId, project, {
    assumeContextFiles: true,
    preloaded: {
      docs: preloaded.docs,
      quests: preloaded.readinessQuests,
      reports: preloaded.reports,
      repoSnapshot: preloaded.repoSnapshot,
    },
  });
  const collaborationGuide = buildCollaborationGuide(readiness, project);
  const repoSnapshot = preloaded.repoSnapshot;

  return {
    summaryPack,
    workspacePack,
    fullPack,
    readiness,
    collaborationGuide,
    repoSnapshot,
  };
}

function bundlesMatch(
  left: Awaited<ReturnType<typeof buildLegacyBundle>>,
  right: Awaited<ReturnType<typeof buildPreloadedBundle>>,
) {
  const normalizedLeft = {
    summaryPack: normalizePack(left.summaryPack),
    workspacePack: normalizePack(left.workspacePack),
    fullPack: normalizePack(left.fullPack),
    readiness: left.readiness,
    collaborationGuide: left.collaborationGuide,
    repoSnapshot: left.repoSnapshot,
  };
  const normalizedRight = {
    summaryPack: normalizePack(right.summaryPack),
    workspacePack: normalizePack(right.workspacePack),
    fullPack: normalizePack(right.fullPack),
    readiness: right.readiness,
    collaborationGuide: right.collaborationGuide,
    repoSnapshot: right.repoSnapshot,
  };

  const sections = Object.keys(normalizedLeft) as Array<keyof typeof normalizedLeft>;
  for (const section of sections) {
    const diff = firstDiff(normalizedLeft[section], normalizedRight[section], [
      section,
    ]);
    if (diff) {
      return {
        ok: false,
        diff,
      };
    }
  }

  return {
    ok: true,
    diff: null,
  };
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "3", 10) || 3;
  const { id: userId } = await resolveUserContext();
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  const legacyBundle = await buildLegacyBundle(userId, project);
  const preloadedBundle = await buildPreloadedBundle(userId, project);
  const parity = bundlesMatch(legacyBundle, preloadedBundle);
  if (!parity.ok) {
    throw new Error(
      JSON.stringify({
        message: "preloaded dashboard context bundle diverged from legacy output",
        diff: parity.diff,
      }),
    );
  }

  const legacyRuns: BenchmarkRun[] = [];
  const preloadedRuns: BenchmarkRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const legacyStarted = performance.now();
    await buildLegacyBundle(userId, project);
    legacyRuns.push({ ms: performance.now() - legacyStarted });

    const preloadedStarted = performance.now();
    await buildPreloadedBundle(userId, project);
    preloadedRuns.push({ ms: performance.now() - preloadedStarted });
  }

  const legacyAvg = averageMs(legacyRuns);
  const preloadedAvg = averageMs(preloadedRuns);

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        iterations,
        parity: {
          ok: true,
          summaryReadiness: legacyBundle.summaryPack.readiness.score,
          overviewReadiness: legacyBundle.workspacePack.readiness.score,
          fullReadiness: legacyBundle.fullPack.readiness.score,
        },
        legacyRuns,
        preloadedRuns,
        legacyAvgMs: Number(legacyAvg.toFixed(2)),
        preloadedAvgMs: Number(preloadedAvg.toFixed(2)),
        deltaMs: Number((preloadedAvg - legacyAvg).toFixed(2)),
        improvementPercent: Number(
          (((legacyAvg - preloadedAvg) / legacyAvg) * 100).toFixed(1),
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
