import {
  findWorkspaceProject,
  getControlPlaneProjectId,
} from "@/server/projects/workspace-projects";
import { buildN8nAutomationSnapshot } from "@/server/services/n8n-service";
import {
  collectBoundedCodegraphSummaryWithGate,
  isCodegraphSpikeBoundedModeEnabled,
} from "@/server/services/codegraph-summary-service";

type BenchmarkRun = {
  ms: number;
  codegraphReason: string;
  automationStatus: string;
};

async function runSequential(iterations: number) {
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  const runs: BenchmarkRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    const codegraph = isCodegraphSpikeBoundedModeEnabled()
      ? await collectBoundedCodegraphSummaryWithGate(project)
      : {
          block: undefined,
          reason: "bounded mode disabled",
          reasonCode: "bounded_disabled",
        };
    const automation = await buildN8nAutomationSnapshot(project);

    runs.push({
      ms: performance.now() - started,
      codegraphReason: codegraph.reasonCode || "ok",
      automationStatus: automation.status,
    });
  }

  return { project, runs };
}

async function runParallel(iterations: number) {
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  const runs: BenchmarkRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    const [codegraph, automation] = await Promise.all([
      isCodegraphSpikeBoundedModeEnabled()
        ? collectBoundedCodegraphSummaryWithGate(project)
        : Promise.resolve({
            block: undefined,
            reason: "bounded mode disabled",
            reasonCode: "bounded_disabled",
          }),
      buildN8nAutomationSnapshot(project),
    ]);

    runs.push({
      ms: performance.now() - started,
      codegraphReason: codegraph.reasonCode || "ok",
      automationStatus: automation.status,
    });
  }

  return { project, runs };
}

function averageMs(runs: BenchmarkRun[]) {
  return runs.reduce((sum, run) => sum + run.ms, 0) / runs.length;
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const sequential = await runSequential(iterations);
  const parallel = await runParallel(iterations);
  const sequentialAvg = averageMs(sequential.runs);
  const parallelAvg = averageMs(parallel.runs);

  console.log(
    JSON.stringify(
      {
        projectId: sequential.project.id,
        iterations,
        sequentialRuns: sequential.runs,
        parallelRuns: parallel.runs,
        sequentialAvgMs: Number(sequentialAvg.toFixed(2)),
        parallelAvgMs: Number(parallelAvg.toFixed(2)),
        deltaMs: Number((parallelAvg - sequentialAvg).toFixed(2)),
        improvementPercent: Number(
          (((sequentialAvg - parallelAvg) / sequentialAvg) * 100).toFixed(1),
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
