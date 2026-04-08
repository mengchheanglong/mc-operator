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
  findWorkspaceProject,
  getControlPlaneProjectId,
} from "@/server/projects/workspace-projects";

type BenchmarkRun = {
  ms: number;
};

type ReadonlyRepoSnapshot = {
  questIds: string[];
  reportIds: string[];
  docIds: string[];
  noteIds: string[];
};

function averageMs(runs: BenchmarkRun[]) {
  return runs.reduce((sum, run) => sum + run.ms, 0) / runs.length;
}

function clearReadonlyRepoCaches(userId: string, projectId: string) {
  clearQuestListCache(userId, projectId);
  clearReportListCache(userId, projectId);
  clearDocListCache(userId, projectId);
  clearNoteListCache(userId, projectId);
}

function buildReadonlyRepoSnapshot(userId: string, projectId: string): ReadonlyRepoSnapshot {
  const quests = listQuests(userId, projectId, { limit: 16 });
  const reports = listReports(userId, projectId, { limit: 6 });
  const docs = listDocs(userId, projectId);
  const notes = listNotes(userId, projectId);

  return {
    questIds: quests.map((quest) => quest.id),
    reportIds: reports.map((report) => report.id),
    docIds: docs.map((doc) => doc.id),
    noteIds: notes.map((note) => note.id),
  };
}

function snapshotsMatch(left: ReadonlyRepoSnapshot, right: ReadonlyRepoSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const { id: userId } = await resolveUserContext();
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  const uncachedRuns: BenchmarkRun[] = [];
  let uncachedSnapshot: ReadonlyRepoSnapshot | null = null;

  for (let index = 0; index < iterations; index += 1) {
    clearReadonlyRepoCaches(userId, project.id);
    const started = performance.now();
    const snapshot = buildReadonlyRepoSnapshot(userId, project.id);
    uncachedRuns.push({ ms: performance.now() - started });
    if (!uncachedSnapshot) {
      uncachedSnapshot = snapshot;
    }
  }

  clearReadonlyRepoCaches(userId, project.id);
  const warmSnapshot = buildReadonlyRepoSnapshot(userId, project.id);
  const cachedRuns: BenchmarkRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    buildReadonlyRepoSnapshot(userId, project.id);
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
          ok: Boolean(uncachedSnapshot && snapshotsMatch(uncachedSnapshot, warmSnapshot)),
          counts: {
            quests: warmSnapshot.questIds.length,
            reports: warmSnapshot.reportIds.length,
            docs: warmSnapshot.docIds.length,
            notes: warmSnapshot.noteIds.length,
          },
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
