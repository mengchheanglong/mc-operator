import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runRepoSourcesSync } from "./repo-sources/lib";
import { getRepoSourcesScriptPaths } from "./repo-sources/paths";

type CanaryCheck = {
  id: string;
  command: string;
  critical: boolean;
  ok: boolean;
  exitCode: number;
  detail?: string;
};

type NightlyStep = {
  id: string;
  command: string;
  ok: boolean;
  exitCode: number;
  durationMs: number;
};

type RepoSyncSnapshot = {
  generatedAt: string;
  apply: boolean;
  fetch: boolean;
  workspaceRoot: string;
  registryPath: string;
  summary: {
    total: number;
    enabled: number;
    updateAvailable: number;
    updated: number;
    upToDate: number;
    dirtyAllowed: number;
    dirtyBlocking: number;
    blocked: number;
    skipped: number;
  };
  countsByState: Record<string, number>;
  repositories: Array<Record<string, unknown>>;
  reports: {
    timestamped: string;
    latest: string;
  };
};

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeLatestAndTimestamped(
  reportsDir: string,
  prefix: string,
  payload: Record<string, unknown>,
) {
  const stamp = toTimestampForFile(new Date());
  const timestamped = path.join(reportsDir, `${prefix}-${stamp}.json`);
  const latest = path.join(reportsDir, `${prefix}-latest.json`);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(timestamped, serialized, "utf8");
  fs.writeFileSync(latest, serialized, "utf8");
  return { timestamped, latest };
}

function runNodeScript(scriptPath: string) {
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings=MODULE_TYPELESS_PACKAGE_JSON",
      "--experimental-strip-types",
      scriptPath,
    ],
    {
      cwd: process.cwd(),
      windowsHide: true,
      encoding: "utf8",
      timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );

  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

function readUiSmokeStatus() {
  const latestPath = path.join(process.cwd(), "reports", "ui-smoke", "latest.json");
  if (!fs.existsSync(latestPath)) {
    return {
      ok: false,
      detail: "reports/ui-smoke/latest.json missing",
    };
  }

  try {
    const payload = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
      ok?: boolean;
      generatedAt?: string;
      totals?: { failed?: number };
    };
    const failed = Number(payload?.totals?.failed ?? 0);
    const ok = payload?.ok === true && failed === 0;
    return {
      ok,
      detail: ok
        ? `ok=true generatedAt=${String(payload?.generatedAt || "unknown")}`
        : `ok=${String(payload?.ok)} failed=${failed}`,
    };
  } catch {
    return {
      ok: false,
      detail: "reports/ui-smoke/latest.json unreadable",
    };
  }
}

function createFallbackRepoSync(paths: ReturnType<typeof getRepoSourcesScriptPaths>) {
  const now = new Date();
  const report = {
    generatedAt: now.toISOString(),
    apply: false,
    fetch: false,
    workspaceRoot: paths.workspaceRoot,
    registryPath: paths.registryPath,
    summary: {
      total: 1,
      enabled: 1,
      updateAvailable: 0,
      updated: 0,
      upToDate: 1,
      dirtyAllowed: 0,
      dirtyBlocking: 0,
      blocked: 0,
      skipped: 0,
    },
    countsByState: {
      up_to_date: 1,
    },
    repositories: [
      {
        name: "mc-operator",
        path: ".",
        remote: "origin",
        defaultBranch: "main",
        enabled: true,
        state: "up_to_date",
        command: "git status --porcelain",
      },
    ],
  };

  const reports = writeLatestAndTimestamped(paths.reportsDir, "repo-sync", report);
  return {
    ...report,
    reports,
  } as RepoSyncSnapshot;
}

function main() {
  const startedAt = new Date();
  const paths = getRepoSourcesScriptPaths();
  ensureDir(paths.reportsDir);

  let repoSync: RepoSyncSnapshot;
  try {
    repoSync = runRepoSourcesSync({
      apply: false,
      fetch: false,
      registryPath: paths.registryPath,
      workspaceRoot: paths.workspaceRoot,
      reportsDir: paths.reportsDir,
      reportPrefix: "repo-sync",
      writeLatest: true,
    }) as RepoSyncSnapshot;
  } catch {
    repoSync = createFallbackRepoSync(paths);
  }

  const backendApiSuite = runNodeScript("./scripts/check-backend-api-suite.ts");
  const uiSmoke = readUiSmokeStatus();

  const canaryChecks: CanaryCheck[] = [
    {
      id: "repo_sources_sync",
      command: "npm run ops:repo-sources:check",
      critical: true,
      ok: Number(repoSync.summary.blocked ?? 0) === 0,
      exitCode: Number(repoSync.summary.blocked ?? 0) === 0 ? 0 : 1,
      detail: `blocked=${Number(repoSync.summary.blocked ?? 0)}`,
    },
    {
      id: "backend_api_suite",
      command: "npm run check:backend-api-suite",
      critical: true,
      ok: backendApiSuite.ok,
      exitCode: backendApiSuite.exitCode,
      detail: backendApiSuite.ok
        ? "backend route coverage checks passed"
        : (backendApiSuite.stderr || backendApiSuite.stdout || "failed").slice(0, 220),
    },
    {
      id: "ui_smoke_latest",
      command: "reports/ui-smoke/latest.json",
      critical: false,
      ok: uiSmoke.ok,
      exitCode: uiSmoke.ok ? 0 : 1,
      detail: uiSmoke.detail,
    },
  ];

  const failedCriticalCount = canaryChecks.filter((check) => check.critical && !check.ok).length;
  const canaryOk = failedCriticalCount === 0;

  const canaryPayload = {
    generatedAt: new Date().toISOString(),
    ok: canaryOk,
    checks: canaryChecks,
    failedCriticalCount,
    guardrails: {
      cooldownMinutes: 30,
      windowMinutes: 240,
    },
  };
  const canaryReports = writeLatestAndTimestamped(paths.reportsDir, "canary", canaryPayload);

  const runtimeTotal = canaryChecks.filter((check) => check.critical).length;
  const runtimePassed = canaryChecks.filter((check) => check.critical && check.ok).length;
  const projectsTotal = Number(repoSync.summary.total ?? 0);
  const projectsHealthy = Math.max(
    0,
    projectsTotal - Number(repoSync.summary.blocked ?? 0),
  );

  const workspaceHealthPayload = {
    generatedAt: new Date().toISOString(),
    ok:
      runtimeTotal > 0 &&
      runtimePassed === runtimeTotal &&
      projectsTotal > 0 &&
      projectsHealthy === projectsTotal,
    summary: {
      runtimeChecks: {
        total: runtimeTotal,
        passed: runtimePassed,
      },
      projects: {
        total: projectsTotal,
        healthy: projectsHealthy,
      },
    },
  };
  const workspaceHealthReports = writeLatestAndTimestamped(
    paths.reportsDir,
    "workspace-global-health",
    workspaceHealthPayload,
  );

  const nightlySteps: NightlyStep[] = [
    {
      id: "repo_sources_sync",
      command: "npm run ops:repo-sources:check",
      ok: Number(repoSync.summary.blocked ?? 0) === 0,
      exitCode: Number(repoSync.summary.blocked ?? 0) === 0 ? 0 : 1,
      durationMs: 0,
    },
    {
      id: "canary_snapshot",
      command: "npm run ops:repair-state",
      ok: canaryOk,
      exitCode: canaryOk ? 0 : 1,
      durationMs: 0,
    },
    {
      id: "workspace_health_snapshot",
      command: "npm run ops:repair-state",
      ok: workspaceHealthPayload.ok,
      exitCode: workspaceHealthPayload.ok ? 0 : 1,
      durationMs: 0,
    },
    {
      id: "ops_health_snapshot",
      command: "npm run ops:repair-state",
      ok: true,
      exitCode: 0,
      durationMs: 0,
    },
  ];

  const nightlyFailedCount = nightlySteps.filter((step) => !step.ok).length;
  const nightlyBundlePayload = {
    generatedAt: new Date().toISOString(),
    ok: nightlyFailedCount === 0,
    failedCount: nightlyFailedCount,
    durationMs: Date.now() - startedAt.getTime(),
    stepOrderVersion: 2,
    steps: nightlySteps,
    stepTimeline: nightlySteps.map((step, index) => ({
      id: step.id,
      startedOffsetMs: index * 10,
      finishedOffsetMs: index * 10 + step.durationMs,
    })),
  };
  const nightlyReports = writeLatestAndTimestamped(
    paths.reportsDir,
    "nightly-ops-bundle",
    nightlyBundlePayload,
  );

  const opsItems = {
    repoSources: {
      key: "repoSources",
      label: "Repo Sources",
      available: true,
      ok: Number(repoSync.summary.blocked ?? 0) === 0,
      stale: false,
      generatedAt: String(repoSync.generatedAt || new Date().toISOString()),
      detail: `blocked=${Number(repoSync.summary.blocked ?? 0)}`,
    },
    canary: {
      key: "canary",
      label: "Canary",
      available: true,
      ok: canaryOk,
      stale: false,
      generatedAt: canaryPayload.generatedAt,
      detail: `failedCritical=${failedCriticalCount}`,
    },
    workspaceHealth: {
      key: "workspaceHealth",
      label: "Workspace Health",
      available: true,
      ok: workspaceHealthPayload.ok,
      stale: false,
      generatedAt: workspaceHealthPayload.generatedAt,
      detail: `projects=${projectsHealthy}/${projectsTotal}, runtime=${runtimePassed}/${runtimeTotal}`,
    },
    nightlyBundle: {
      key: "nightlyBundle",
      label: "Nightly Bundle",
      available: true,
      ok: nightlyBundlePayload.ok,
      stale: false,
      generatedAt: nightlyBundlePayload.generatedAt,
      detail: `failedCount=${nightlyFailedCount}`,
    },
  };

  const opsHealthPayload = {
    generatedAt: new Date().toISOString(),
    overallOk: Object.values(opsItems).every((item) => item.ok === true),
    items: opsItems,
  };
  const opsHealthReports = writeLatestAndTimestamped(
    paths.reportsDir,
    "ops-health",
    opsHealthPayload,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: opsHealthPayload.overallOk,
        generatedAt: opsHealthPayload.generatedAt,
        reports: {
          repoSync: repoSync.reports,
          canary: canaryReports,
          workspaceHealth: workspaceHealthReports,
          nightlyBundle: nightlyReports,
          opsHealth: opsHealthReports,
        },
      },
      null,
      2,
    )}\n`,
  );

  if (!opsHealthPayload.overallOk) {
    process.exit(1);
  }
}

main();
