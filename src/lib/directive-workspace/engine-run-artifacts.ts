// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/engine-run-artifacts.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import fs from "node:fs";
import path from "node:path";

export type StoredDirectiveEngineRunRecord = {
  runId: string;
  receivedAt: string;
  source: {
    sourceType: string;
    sourceRef: string;
    title: string;
  };
  selectedLane: {
    laneId: string;
    label: string;
    hostDependence: string;
    valuableWithoutHostRuntime: boolean;
  };
  candidate: {
    candidateId: string;
    candidateName: string;
    recommendedLaneId: string;
    usefulnessLevel: string;
    confidence: string;
    requiresHumanReview: boolean;
    rationale: string[];
  };
  analysis: {
    missionFitSummary: string;
    primaryAdoptionQuestion: string;
    usefulnessRationale: string;
    rationale: string[];
  };
  decision: {
    decisionState: string;
    summary: string;
    requiresHumanApproval: boolean;
    rationale: string[];
  };
  integrationProposal: {
    targetLaneId: string;
    integrationMode: string;
    hostDependence: string;
    valuableWithoutHostRuntime: boolean;
    nextAction: string;
  };
  proofPlan: {
    proofKind: string;
    objective: string;
  };
  reportPlan: {
    reportKind: string;
    summary: string;
    usefulnessRationale: string;
  };
  events: Array<{
    type: string;
    at: string;
    summary: string;
  }>;
};

export type DirectiveEngineRunArtifact = {
  recordPath: string;
  reportPath: string | null;
  reportExcerpt: string | null;
  reportContent?: string | null;
  record: StoredDirectiveEngineRunRecord;
};

export type DirectiveEngineRunDetail = {
  ok: boolean;
  error?: string;
  rootPath: string;
  engineRunsRoot: string;
  snapshotAt: string;
  recordPath: string | null;
  reportPath: string | null;
  reportExcerpt: string | null;
  reportContent: string | null;
  record: StoredDirectiveEngineRunRecord | null;
};

export type DirectiveEngineRunsOverview = {
  ok: boolean;
  error?: string;
  rootPath: string;
  engineRunsRoot: string;
  snapshotAt: string;
  totalRuns: number;
  invalidArtifacts: number;
  counts: {
    discovery: number;
    runtime: number;
    forge: number;
    architecture: number;
    direct: number;
    structural: number;
    meta: number;
    humanReview: number;
    holdInDiscovery: number;
    routeToForge: number;
    routeToRuntime: number;
    acceptForArchitecture: number;
  };
  latest: {
    recordPath: string | null;
    reportPath: string | null;
  };
  recentRuns: DirectiveEngineRunArtifact[];
};

type ReadDirectiveEngineRunsOverviewOptions = {
  directiveRoot?: string;
  maxRuns?: number;
};

type ReadDirectiveEngineRunDetailOptions = {
  directiveRoot?: string;
  runId: string;
};

function normalizePath(filePath: string) {
  return path.resolve(filePath).replace(/\\/g, "/");
}

function getDefaultDirectiveWorkspaceRoot() {
  return normalizePath(
    process.env.DIRECTIVE_WORKSPACE_ROOT
    || process.env.DIRECTIVE_WORKSPACE_ROOT_OVERRIDE
    || path.resolve(process.cwd(), "..", "directive-workspace"),
  );
}

function isRecordLike(value: unknown): value is StoredDirectiveEngineRunRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const candidate = record.candidate as Record<string, unknown> | undefined;
  const analysis = record.analysis as Record<string, unknown> | undefined;
  const decision = record.decision as Record<string, unknown> | undefined;
  const reportPlan = record.reportPlan as Record<string, unknown> | undefined;

  return (
    typeof record.runId === "string"
    && typeof record.receivedAt === "string"
    && typeof candidate?.candidateId === "string"
    && typeof candidate?.candidateName === "string"
    && typeof candidate?.recommendedLaneId === "string"
    && typeof candidate?.usefulnessLevel === "string"
    && typeof analysis?.usefulnessRationale === "string"
    && typeof decision?.decisionState === "string"
    && typeof reportPlan?.summary === "string"
    && typeof reportPlan?.usefulnessRationale === "string"
  );
}

function readJson(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function summarizeReportMarkdown(content: string | null, fallback: string) {
  if (!content) {
    return fallback;
  }

  const candidate = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (line.startsWith("#")) return false;
      if (/^- (Run ID|Received At|Candidate ID|Candidate Name|Source Type|Source Ref|Selected Lane|Usefulness Level|Decision State|Integration Mode|Proof Kind|Run Record Path):/.test(line)) {
        return false;
      }
      return true;
    })[0];

  const normalized = String(candidate || fallback).replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) {
    return normalized;
  }
  return `${normalized.slice(0, 219).trim()}...`;
}

function readRunArtifact(
  recordPath: string,
  options: { includeReportContent?: boolean } = {},
): DirectiveEngineRunArtifact | null {
  const parsed = readJson(recordPath);
  if (!isRecordLike(parsed)) {
    return null;
  }

  const reportPath = recordPath.replace(/\.json$/i, ".md");
  const reportExists = fs.existsSync(reportPath);
  const reportContent = reportExists ? fs.readFileSync(reportPath, "utf8") : null;
  const hostLaneId =
    parsed.selectedLane?.laneId === "runtime"
      ? "forge"
      : parsed.selectedLane?.laneId;
  const hostRecommendedLaneId =
    parsed.candidate?.recommendedLaneId === "runtime"
      ? "forge"
      : parsed.candidate?.recommendedLaneId;

  return {
    recordPath: normalizePath(recordPath),
    reportPath: reportExists ? normalizePath(reportPath) : null,
    reportExcerpt: summarizeReportMarkdown(reportContent, parsed.reportPlan.summary),
    reportContent: options.includeReportContent ? reportContent : undefined,
    record: {
      ...parsed,
      selectedLane: {
        ...parsed.selectedLane,
        laneId: hostLaneId,
      },
      candidate: {
        ...parsed.candidate,
        recommendedLaneId: hostRecommendedLaneId,
      },
    },
  };
}

function listEngineRunRecordPaths(engineRunsRoot: string) {
  if (!fs.existsSync(engineRunsRoot)) {
    return [];
  }

  return fs
    .readdirSync(engineRunsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(engineRunsRoot, entry.name))
    .sort((left, right) => path.basename(right).localeCompare(path.basename(left)));
}

function zeroCounts() {
  return {
    discovery: 0,
    runtime: 0,
    forge: 0,
    architecture: 0,
    direct: 0,
    structural: 0,
    meta: 0,
    humanReview: 0,
    holdInDiscovery: 0,
    routeToForge: 0,
    routeToRuntime: 0,
    acceptForArchitecture: 0,
  };
}

export function readDirectiveEngineRunsOverview(
  options: ReadDirectiveEngineRunsOverviewOptions = {},
): DirectiveEngineRunsOverview {
  const directiveRoot = normalizePath(options.directiveRoot || getDefaultDirectiveWorkspaceRoot());
  const engineRunsRoot = normalizePath(
    path.join(directiveRoot, "runtime", "standalone-host", "engine-runs"),
  );
  const maxRuns = Math.max(1, options.maxRuns ?? 6);
  const counts = zeroCounts();

  if (!fs.existsSync(engineRunsRoot)) {
    return {
      ok: false,
      rootPath: directiveRoot,
      engineRunsRoot,
      snapshotAt: new Date().toISOString(),
      totalRuns: 0,
      invalidArtifacts: 0,
      counts,
      latest: {
        recordPath: null,
        reportPath: null,
      },
      recentRuns: [],
    };
  }

  const recordPaths = listEngineRunRecordPaths(engineRunsRoot);
  const artifacts: DirectiveEngineRunArtifact[] = [];
  let invalidArtifacts = 0;

  for (const recordPath of recordPaths) {
    const artifact = readRunArtifact(recordPath);
    if (!artifact) {
      invalidArtifacts += 1;
      continue;
    }

    const laneId = artifact.record.selectedLane?.laneId || artifact.record.candidate.recommendedLaneId;
    if (laneId === "discovery") counts.discovery += 1;
    if (laneId === "runtime" || laneId === "forge") {
      counts.runtime += 1;
      counts.forge += 1;
    }
    if (laneId === "architecture") counts.architecture += 1;

    if (artifact.record.candidate.usefulnessLevel === "direct") counts.direct += 1;
    if (artifact.record.candidate.usefulnessLevel === "structural") counts.structural += 1;
    if (artifact.record.candidate.usefulnessLevel === "meta") counts.meta += 1;

    if (
      artifact.record.candidate.requiresHumanReview
      || artifact.record.decision.requiresHumanApproval
    ) {
      counts.humanReview += 1;
    }

    if (artifact.record.decision.decisionState === "hold_in_discovery") {
      counts.holdInDiscovery += 1;
    }
    if (artifact.record.decision.decisionState === "route_to_forge_follow_up") {
      counts.routeToForge += 1;
    }
    if (artifact.record.decision.decisionState === "route_to_runtime_follow_up") {
      counts.routeToRuntime += 1;
    }
    if (artifact.record.decision.decisionState === "accept_for_architecture") {
      counts.acceptForArchitecture += 1;
    }

    artifacts.push(artifact);
  }

  const recentRuns = artifacts.slice(0, maxRuns);
  const latest = recentRuns[0] || null;

  return {
    ok: true,
    rootPath: directiveRoot,
    engineRunsRoot,
    snapshotAt: new Date().toISOString(),
    totalRuns: artifacts.length,
    invalidArtifacts,
    counts,
    latest: {
      recordPath: latest?.recordPath || null,
      reportPath: latest?.reportPath || null,
    },
    recentRuns,
  };
}

export function readDirectiveEngineRunDetail(
  options: ReadDirectiveEngineRunDetailOptions,
): DirectiveEngineRunDetail {
  const directiveRoot = normalizePath(options.directiveRoot || getDefaultDirectiveWorkspaceRoot());
  const engineRunsRoot = normalizePath(
    path.join(directiveRoot, "runtime", "standalone-host", "engine-runs"),
  );
  const runId = String(options.runId || "").trim();

  if (!runId) {
    return {
      ok: false,
      error: "missing_run_id",
      rootPath: directiveRoot,
      engineRunsRoot,
      snapshotAt: new Date().toISOString(),
      recordPath: null,
      reportPath: null,
      reportExcerpt: null,
      reportContent: null,
      record: null,
    };
  }

  for (const recordPath of listEngineRunRecordPaths(engineRunsRoot)) {
    const artifact = readRunArtifact(recordPath, { includeReportContent: true });
    if (!artifact) {
      continue;
    }
    if (artifact.record.runId !== runId) {
      continue;
    }

    return {
      ok: true,
      rootPath: directiveRoot,
      engineRunsRoot,
      snapshotAt: new Date().toISOString(),
      recordPath: artifact.recordPath,
      reportPath: artifact.reportPath,
      reportExcerpt: artifact.reportExcerpt,
      reportContent: artifact.reportContent ?? null,
      record: artifact.record,
    };
  }

  return {
    ok: false,
    error: "run_not_found",
    rootPath: directiveRoot,
    engineRunsRoot,
    snapshotAt: new Date().toISOString(),
    recordPath: null,
    reportPath: null,
    reportExcerpt: null,
    reportContent: null,
    record: null,
  };
}
