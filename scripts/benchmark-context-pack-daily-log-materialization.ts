import { resolveUserContext } from "@/server/context/user-context";
import {
  findWorkspaceProject,
  getControlPlaneProjectId,
} from "@/server/projects/workspace-projects";
import { listDailyReportLogs } from "@/server/services/daily-report-log-service";

type BenchmarkRun = {
  ms: number;
};

function averageMs(runs: BenchmarkRun[]) {
  return runs.reduce((sum, run) => sum + run.ms, 0) / runs.length;
}

function trimText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function extractLegacyPreview(content: string, entryCount: number) {
  const firstEntry = content
    .split("## Entries")[1]
    ?.split("###")[1]
    ?.replace(/\s+/g, " ")
    .trim();
  return firstEntry || `${entryCount} logged updates.`;
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const { id: userId } = await resolveUserContext();
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  const materialized = listDailyReportLogs(userId, project.id, {
    materializeFiles: true,
    includeContent: true,
  });
  const readOnly = listDailyReportLogs(userId, project.id, {
    materializeFiles: false,
    includeContent: false,
  });
  const parityOk = materialized.every((log, index) => {
    const candidate = readOnly[index];
    if (!candidate) {
      return false;
    }

    return JSON.stringify({
      dayKey: log.dayKey,
      title: log.title,
      preview: trimText(extractLegacyPreview(log.content, log.entryCount), 160),
      entryCount: log.entryCount,
      areas: log.areas,
      topics: log.topics,
      categories: log.categories,
      latestDate: log.latestDate,
    }) === JSON.stringify({
      dayKey: candidate.dayKey,
      title: candidate.title,
      preview: trimText(candidate.preview, 160),
      entryCount: candidate.entryCount,
      areas: candidate.areas,
      topics: candidate.topics,
      categories: candidate.categories,
      latestDate: candidate.latestDate,
    });
  });
  if (!parityOk || materialized.length !== readOnly.length) {
    const mismatchIndex = materialized.findIndex((log, index) => {
      const candidate = readOnly[index];
      if (!candidate) {
        return true;
      }

      return JSON.stringify({
        dayKey: log.dayKey,
        title: log.title,
        preview: extractLegacyPreview(log.content, log.entryCount),
        entryCount: log.entryCount,
        areas: log.areas,
        topics: log.topics,
        categories: log.categories,
        latestDate: log.latestDate,
      }) !== JSON.stringify({
        dayKey: candidate.dayKey,
        title: candidate.title,
        preview: candidate.preview,
        entryCount: candidate.entryCount,
        areas: candidate.areas,
        topics: candidate.topics,
        categories: candidate.categories,
        latestDate: candidate.latestDate,
      });
    });
    throw new Error(
      JSON.stringify({
        message: "context-pack daily log summary diverged from legacy output",
        mismatchIndex,
        expected: materialized[mismatchIndex]
          ? {
              dayKey: materialized[mismatchIndex].dayKey,
              title: materialized[mismatchIndex].title,
              preview: trimText(
                extractLegacyPreview(
                  materialized[mismatchIndex].content,
                  materialized[mismatchIndex].entryCount,
                ),
                160,
              ),
              entryCount: materialized[mismatchIndex].entryCount,
              areas: materialized[mismatchIndex].areas,
              topics: materialized[mismatchIndex].topics,
              categories: materialized[mismatchIndex].categories,
              latestDate: materialized[mismatchIndex].latestDate,
            }
          : null,
        actual: readOnly[mismatchIndex]
          ? {
              dayKey: readOnly[mismatchIndex].dayKey,
              title: readOnly[mismatchIndex].title,
              preview: trimText(readOnly[mismatchIndex].preview, 160),
              entryCount: readOnly[mismatchIndex].entryCount,
              areas: readOnly[mismatchIndex].areas,
              topics: readOnly[mismatchIndex].topics,
              categories: readOnly[mismatchIndex].categories,
              latestDate: readOnly[mismatchIndex].latestDate,
            }
          : null,
      }),
    );
  }

  const materializedRuns: BenchmarkRun[] = [];
  const readOnlyRuns: BenchmarkRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const materializedStarted = performance.now();
    listDailyReportLogs(userId, project.id, {
      materializeFiles: true,
      includeContent: true,
    });
    materializedRuns.push({ ms: performance.now() - materializedStarted });

    const readOnlyStarted = performance.now();
    listDailyReportLogs(userId, project.id, {
      materializeFiles: false,
      includeContent: false,
    });
    readOnlyRuns.push({ ms: performance.now() - readOnlyStarted });
  }

  const materializedAvg = averageMs(materializedRuns);
  const readOnlyAvg = averageMs(readOnlyRuns);

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        iterations,
        parity: {
          ok: true,
          dailyLogCount: materialized.length,
          latestDayKey: materialized[0]?.dayKey || null,
        },
        materializedRuns,
        readOnlyRuns,
        materializedAvgMs: Number(materializedAvg.toFixed(2)),
        readOnlyAvgMs: Number(readOnlyAvg.toFixed(2)),
        deltaMs: Number((readOnlyAvg - materializedAvg).toFixed(2)),
        improvementPercent: Number(
          (((materializedAvg - readOnlyAvg) / materializedAvg) * 100).toFixed(1),
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
