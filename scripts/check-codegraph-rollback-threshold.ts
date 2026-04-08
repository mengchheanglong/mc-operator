import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

type Row = {
  ts?: string;
  indexSuccess?: boolean;
  graphBlockInjected?: boolean;
};

type WindowSummary = {
  total: number;
  indexSuccessRate: number;
  injectionRate: number;
};

const INDEX_THRESHOLD = 0.85;
const INJECTION_THRESHOLD = 0.8;
const WINDOW_SIZE = 10;
const WINDOWS_REQUIRED = 2;
const FRESHNESS_THRESHOLD_HOURS = 24;

function round(value: number) {
  return Number(value.toFixed(3));
}

function summarizeWindow(rows: Row[]): WindowSummary {
  const total = rows.length;
  if (total === 0) {
    return { total: 0, indexSuccessRate: 0, injectionRate: 0 };
  }

  const indexSuccessCount = rows.filter((row) => Boolean(row.indexSuccess)).length;
  const injectionCount = rows.filter((row) => Boolean(row.graphBlockInjected)).length;

  return {
    total,
    indexSuccessRate: round(indexSuccessCount / total),
    injectionRate: round(injectionCount / total),
  };
}

function isUnderThreshold(window: WindowSummary) {
  return window.indexSuccessRate < INDEX_THRESHOLD || window.injectionRate < INJECTION_THRESHOLD;
}

function computeTelemetryAgeHours(latestTelemetryTs: string | null) {
  if (!latestTelemetryTs) return null;
  const ms = Date.parse(latestTelemetryTs);
  if (Number.isNaN(ms)) return null;
  return round((Date.now() - ms) / (1000 * 60 * 60));
}

function writeArtifact(payload: unknown, artifactPath: string) {
  const dir = path.dirname(artifactPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function emitAndExit(
  payload: Record<string, unknown>,
  summary: string,
  exitCode: number,
  artifactPath: string,
) {
  const enriched = {
    ...payload,
    generatedAt: new Date().toISOString(),
  };
  writeArtifact(enriched, artifactPath);
  process.stdout.write(`${JSON.stringify(enriched, null, 2)}\n`);
  process.stdout.write(`${summary}\n`);
  process.exit(exitCode);
}

function main() {
  const telemetryPath = path.join(process.cwd(), "reports", "codegraph-spike-artifacts", "telemetry.jsonl");
  const artifactPath = path.join(process.cwd(), "reports", "codegraph-spike-artifacts", "rollback-monitor.json");

  if (!existsSync(telemetryPath)) {
    emitAndExit(
      {
        status: "MALFORMED_OR_MISSING_DATA",
        reason: "telemetry file not found",
        telemetryPath,
        requiredWindows: WINDOWS_REQUIRED,
        windowSize: WINDOW_SIZE,
        thresholds: {
          indexSuccessRate: INDEX_THRESHOLD,
          injectionRate: INJECTION_THRESHOLD,
        },
        windows: null,
        evaluatedRows: 0,
        latestTelemetryTs: null,
        telemetryAgeHours: null,
        freshnessThresholdHours: FRESHNESS_THRESHOLD_HOURS,
      },
      "CodeGraph rollback monitor: malformed/missing telemetry data.",
      1,
      artifactPath,
    );
  }

  let parsedRows: Row[] = [];
  try {
    parsedRows = readFileSync(telemetryPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Row);
  } catch {
    emitAndExit(
      {
        status: "MALFORMED_OR_MISSING_DATA",
        reason: "telemetry parse failure",
        telemetryPath,
        requiredWindows: WINDOWS_REQUIRED,
        windowSize: WINDOW_SIZE,
        thresholds: {
          indexSuccessRate: INDEX_THRESHOLD,
          injectionRate: INJECTION_THRESHOLD,
        },
        windows: null,
        evaluatedRows: 0,
        latestTelemetryTs: null,
        telemetryAgeHours: null,
        freshnessThresholdHours: FRESHNESS_THRESHOLD_HOURS,
      },
      "CodeGraph rollback monitor: telemetry parse failed.",
      1,
      artifactPath,
    );
  }

  const latestTelemetryTs = parsedRows.length > 0 ? String(parsedRows[parsedRows.length - 1]?.ts || "") || null : null;
  const telemetryAgeHours = computeTelemetryAgeHours(latestTelemetryTs);

  if (latestTelemetryTs && telemetryAgeHours !== null && telemetryAgeHours > FRESHNESS_THRESHOLD_HOURS) {
    emitAndExit(
      {
        status: "STALE_TELEMETRY",
        reason: "latest telemetry is older than freshness threshold",
        telemetryPath,
        requiredWindows: WINDOWS_REQUIRED,
        windowSize: WINDOW_SIZE,
        thresholds: {
          indexSuccessRate: INDEX_THRESHOLD,
          injectionRate: INJECTION_THRESHOLD,
        },
        windows: null,
        evaluatedRows: 0,
        latestTelemetryTs,
        telemetryAgeHours,
        freshnessThresholdHours: FRESHNESS_THRESHOLD_HOURS,
      },
      `CodeGraph rollback monitor: STALE_TELEMETRY (age=${telemetryAgeHours}h > ${FRESHNESS_THRESHOLD_HOURS}h).`,
      1,
      artifactPath,
    );
  }

  const needed = WINDOW_SIZE * WINDOWS_REQUIRED;
  if (parsedRows.length < needed) {
    emitAndExit(
      {
        status: "MALFORMED_OR_MISSING_DATA",
        reason: `insufficient rows: need ${needed}, got ${parsedRows.length}`,
        telemetryPath,
        requiredWindows: WINDOWS_REQUIRED,
        windowSize: WINDOW_SIZE,
        thresholds: {
          indexSuccessRate: INDEX_THRESHOLD,
          injectionRate: INJECTION_THRESHOLD,
        },
        windows: null,
        evaluatedRows: parsedRows.length,
        latestTelemetryTs,
        telemetryAgeHours,
        freshnessThresholdHours: FRESHNESS_THRESHOLD_HOURS,
      },
      "CodeGraph rollback monitor: insufficient telemetry rows.",
      1,
      artifactPath,
    );
  }

  const recent = parsedRows.slice(-needed);
  const previousWindowRows = recent.slice(0, WINDOW_SIZE);
  const currentWindowRows = recent.slice(WINDOW_SIZE);

  const previousWindow = summarizeWindow(previousWindowRows);
  const currentWindow = summarizeWindow(currentWindowRows);

  const previousBelow = isUnderThreshold(previousWindow);
  const currentBelow = isUnderThreshold(currentWindow);

  const status = previousBelow && currentBelow ? "ROLLBACK_REQUIRED" : "HEALTHY";

  emitAndExit(
    {
      status,
      thresholds: {
        indexSuccessRate: INDEX_THRESHOLD,
        injectionRate: INJECTION_THRESHOLD,
        rule: "rollback when either metric is below threshold in BOTH 10-run windows",
      },
      windowSize: WINDOW_SIZE,
      windows: {
        previous: previousWindow,
        current: currentWindow,
      },
      evaluatedRows: needed,
      telemetryPath,
      latestTelemetryTs,
      telemetryAgeHours,
      freshnessThresholdHours: FRESHNESS_THRESHOLD_HOURS,
    },
    status === "ROLLBACK_REQUIRED"
      ? `CodeGraph rollback monitor: ROLLBACK_REQUIRED (prev idx=${previousWindow.indexSuccessRate}, inj=${previousWindow.injectionRate}; curr idx=${currentWindow.indexSuccessRate}, inj=${currentWindow.injectionRate}).`
      : `CodeGraph rollback monitor: HEALTHY (prev idx=${previousWindow.indexSuccessRate}, inj=${previousWindow.injectionRate}; curr idx=${currentWindow.indexSuccessRate}, inj=${currentWindow.injectionRate}).`,
    status === "ROLLBACK_REQUIRED" ? 2 : 0,
    artifactPath,
  );
}

main();
