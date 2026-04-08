export interface NightlyOpsBundleStepResult {
  id: string;
  command: string;
  ok: boolean;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface NightlyOpsBundleTimelineItem {
  id: string;
  ok: boolean;
  exitCode: number;
  durationMs: number;
  startedOffsetMs: number;
  finishedOffsetMs: number;
}

export interface NightlyOpsBundlePayload {
  generatedAt: string;
  ok: boolean;
  durationMs: number;
  failedCount: number;
  stepOrderVersion: number;
  steps: NightlyOpsBundleStepResult[];
  stepTimeline: NightlyOpsBundleTimelineItem[];
}

export function isOpsHealthSnapshotLastStep(
  steps: Array<Pick<NightlyOpsBundleStepResult, "id">>,
): boolean {
  const index = steps.findIndex((step) => step.id === "ops_health_snapshot");
  return index >= 0 && index === steps.length - 1;
}

export function buildNightlyOpsBundlePayload(input: {
  startedAt: Date;
  steps: NightlyOpsBundleStepResult[];
}): NightlyOpsBundlePayload {
  let offsetCursor = 0;
  const stepTimeline: NightlyOpsBundleTimelineItem[] = input.steps.map((step) => {
    const startedOffsetMs = offsetCursor;
    offsetCursor += Math.max(0, Number(step.durationMs || 0));
    const finishedOffsetMs = offsetCursor;
    return {
      id: step.id,
      ok: step.ok,
      exitCode: step.exitCode,
      durationMs: step.durationMs,
      startedOffsetMs,
      finishedOffsetMs,
    };
  });

  return {
    generatedAt: input.startedAt.toISOString(),
    ok: input.steps.every((step) => step.ok),
    durationMs: Date.now() - input.startedAt.getTime(),
    failedCount: input.steps.filter((step) => !step.ok).length,
    stepOrderVersion: 2,
    steps: input.steps,
    stepTimeline,
  };
}
