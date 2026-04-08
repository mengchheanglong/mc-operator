import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { createReport, listReports } from "@/server/repositories/reports-repo";
import { findOrCreateUser } from "@/server/repositories/users-repo";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";

type WorkspaceArtifact = {
  absolutePath: string;
  relativePath: string;
  track: "architecture" | "discovery" | "forge" | "shared";
  mtimeIso: string;
};

type SyncPayload = {
  generatedAt: string;
  timezone: string;
  dayKey: string;
  latestArtifactAt: string | null;
  artifactCount: number;
  artifactsByTrack: Record<string, number>;
  artifacts: WorkspaceArtifact[];
  graphChanges: string[];
  signature: string;
  reportPaths: {
    timestampedMarkdown: string;
    latestMarkdown: string;
    timestampedJson: string;
    latestJson: string;
  };
  reportId: string | null;
  graphReportId: string | null;
  reusedReportId: string | null;
};

function formatDayKey(value: string, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function toFileStamp(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function collectMarkdownFiles(rootPath: string) {
  if (!fs.existsSync(rootPath)) return [] as string[];
  const collected: string[] = [];
  const stack = [rootPath];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".md")) continue;
      if (entry.name === ".gitkeep") continue;
      collected.push(fullPath);
    }
  }
  return collected;
}

function isSyncRelevantArtifact(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  const exactFiles = new Set([
    "README.md",
    "OWNERSHIP.md",
    "CHANGELOG.md",
    "PUBLISH_READINESS.md",
    "architecture/README.md",
    "architecture/ARCHITECTURE_EXPLORATION.md",
    "discovery/README.md",
    "forge/README.md",
    "forge/EXTRACTION_CANDIDATES.md",
  ]);
  if (exactFiles.has(normalized)) return true;
  const prefixes = [
    "knowledge/",
    "architecture/02-experiments/",
    "architecture/03-adopted/",
    "architecture/04-deferred-or-rejected/",
    "architecture/05-reference-patterns/",
    "discovery/routing-log/",
    "discovery/monitor/",
    "forge/promotion-records/",
    "forge/records/",
    "forge/follow-up/",
    "shared/",
  ];
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}

function resolveTrack(relativePath: string): WorkspaceArtifact["track"] {
  if (relativePath.startsWith("architecture/")) return "architecture";
  if (relativePath.startsWith("discovery/")) return "discovery";
  if (relativePath.startsWith("forge/")) return "forge";
  return "shared";
}

function collectDirectiveArtifacts(input: {
  directiveRoot: string;
  timezone: string;
  dayKey: string;
}) {
  const files = collectMarkdownFiles(input.directiveRoot);
  const artifacts = files
    .map((absolutePath) => {
      const stat = fs.statSync(absolutePath);
      const mtimeMs = stat.mtime.getTime();
      return {
        absolutePath,
        mtimeMs,
      };
    })
    .filter((entry) => formatDayKey(new Date(entry.mtimeMs).toISOString(), input.timezone) === input.dayKey)
    .map((entry) => {
      const relativePath = path
        .relative(input.directiveRoot, entry.absolutePath)
        .replace(/\\/g, "/");
      return {
        absolutePath: entry.absolutePath,
        relativePath,
        track: resolveTrack(relativePath),
        mtimeIso: new Date(entry.mtimeMs).toISOString(),
      } satisfies WorkspaceArtifact;
    })
    .filter((artifact) => isSyncRelevantArtifact(artifact.relativePath))
    .sort((left, right) => right.mtimeIso.localeCompare(left.mtimeIso));

  const artifactsByTrack: Record<string, number> = {
    architecture: 0,
    discovery: 0,
    forge: 0,
    shared: 0,
  };
  for (const artifact of artifacts) {
    artifactsByTrack[artifact.track] = (artifactsByTrack[artifact.track] || 0) + 1;
  }

  return {
    artifacts,
    artifactsByTrack,
    latestArtifactAt: artifacts[0]?.mtimeIso || null,
  };
}

function parsePorcelainPath(line: string) {
  if (!line.trim()) return "";
  if (line.startsWith("?? ")) {
    return line.slice(3).trim();
  }
  if (line.length < 4) return "";
  const rest = line.slice(3).trim();
  const renameParts = rest.split(" -> ");
  return renameParts[renameParts.length - 1]?.trim() || rest;
}

function collectGraphChanges() {
  let stdout = "";
  try {
    stdout = execSync("git status --porcelain", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch {
    return [] as string[];
  }

  const graphNeedles = [
    "src/app/dashboard/graph/",
    "src/components/graph/",
    "src/app/api/code-graph/",
    "src/server/services/codegraph",
    "src/lib/codegraph",
    "graph",
    "codegraph",
  ];

  const changed = stdout
    .split(/\r?\n/)
    .map(parsePorcelainPath)
    .filter(Boolean)
    .filter((filePath) => {
      const normalized = filePath.replace(/\\/g, "/").toLowerCase();
      return graphNeedles.some((needle) => normalized.includes(needle.toLowerCase()));
    });

  return [...new Set(changed)].sort();
}

function buildSignature(input: { artifacts: WorkspaceArtifact[]; graphChanges: string[] }) {
  const raw = [
    ...input.artifacts.map((artifact) => `${artifact.relativePath}|${artifact.mtimeIso}`),
    ...input.graphChanges.map((graphPath) => `graph:${graphPath}`),
  ].join("\n");
  return createHash("sha1").update(raw || "empty").digest("hex").slice(0, 16);
}

function renderReportContent(payload: SyncPayload) {
  const topArtifactPaths =
    payload.artifacts.length > 0
      ? payload.artifacts.slice(0, 5).map((artifact) => artifact.relativePath).join(" | ")
      : "none";
  const topGraphPaths =
    payload.graphChanges.length > 0
      ? payload.graphChanges.slice(0, 5).join(" | ")
      : "none";

  const lines = [
    `Directive Workspace sync summary (${payload.dayKey}, ${payload.timezone})`,
    `Generated: ${payload.generatedAt}`,
    `Latest artifact: ${payload.latestArtifactAt || "none"}`,
    `Counts: artifacts=${payload.artifactCount}, graphChanges=${payload.graphChanges.length}`,
    `Tracks: architecture=${payload.artifactsByTrack.architecture || 0} | discovery=${payload.artifactsByTrack.discovery || 0} | forge=${payload.artifactsByTrack.forge || 0} | shared=${payload.artifactsByTrack.shared || 0}`,
    `Top artifacts (5): ${topArtifactPaths}`,
    `Top graph paths (5): ${topGraphPaths}`,
    `Signature: ${payload.signature}`,
    `Details: ${payload.reportPaths.latestMarkdown} | ${payload.reportPaths.latestJson}`,
  ];
  return lines.join("\n");
}

function renderReportMarkdown(payload: SyncPayload) {
  const trackRows = [
    `- architecture: ${payload.artifactsByTrack.architecture || 0}`,
    `- discovery: ${payload.artifactsByTrack.discovery || 0}`,
    `- forge: ${payload.artifactsByTrack.forge || 0}`,
    `- shared: ${payload.artifactsByTrack.shared || 0}`,
  ];
  const artifactRows =
    payload.artifacts.length === 0
      ? ["- none"]
      : payload.artifacts.slice(0, 25).map((artifact) => `- ${artifact.relativePath} (${artifact.mtimeIso})`);
  const graphRows =
    payload.graphChanges.length === 0
      ? ["- none"]
      : payload.graphChanges.map((entry) => `- ${entry}`);

  return [
    `# Directive Workspace Report Sync (${payload.generatedAt.slice(0, 10)})`,
    "",
    "## Summary",
    `- generatedAt: ${payload.generatedAt}`,
    `- timezone: ${payload.timezone}`,
    `- dayKey: ${payload.dayKey}`,
    `- latestArtifactAt: ${payload.latestArtifactAt || "none"}`,
    `- artifactCount: ${payload.artifactCount}`,
    `- graphChangesCount: ${payload.graphChanges.length}`,
    `- signature: ${payload.signature}`,
    "",
    "## Artifacts By Track",
    ...trackRows,
    "",
    "## Synced Directive Workspace Artifacts",
    ...artifactRows,
    "",
    "## Graph Context Paths",
    ...graphRows,
    "",
    "## Policy",
    "- This sync is reporting-only context capture for Mission Control.",
    "- It does not imply runtime/callable promotion.",
  ].join("\n");
}

function writeSyncArtifacts(input: {
  reportsDir: string;
  payload: Omit<SyncPayload, "reportPaths">;
}) {
  fs.mkdirSync(input.reportsDir, { recursive: true });
  const stamp = toFileStamp(new Date(input.payload.generatedAt));
  const timestampedMarkdown = path.join(input.reportsDir, `directive-workspace-sync-${stamp}.md`);
  const latestMarkdown = path.join(input.reportsDir, "directive-workspace-sync-latest.md");
  const timestampedJson = path.join(input.reportsDir, `directive-workspace-sync-${stamp}.json`);
  const latestJson = path.join(input.reportsDir, "directive-workspace-sync-latest.json");

  const payload: SyncPayload = {
    ...input.payload,
    reportPaths: {
      timestampedMarkdown,
      latestMarkdown,
      timestampedJson,
      latestJson,
    },
  };

  fs.writeFileSync(timestampedMarkdown, `${renderReportMarkdown(payload)}\n`, "utf8");
  fs.writeFileSync(latestMarkdown, `${renderReportMarkdown(payload)}\n`, "utf8");
  fs.writeFileSync(timestampedJson, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(latestJson, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return payload;
}

function main() {
  const now = new Date();
  const user = findOrCreateUser();
  const projectId = getControlPlaneProjectId();
  const timezone = String(user.timezone || "Asia/Bangkok");
  const dayKey = formatDayKey(now.toISOString(), timezone);
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const reportsDir = path.join(process.cwd(), "reports", "ops");

  const collected = collectDirectiveArtifacts({
    directiveRoot,
    timezone,
    dayKey,
  });
  const graphChanges = collectGraphChanges();
  const signature = buildSignature({
    artifacts: collected.artifacts,
    graphChanges,
  });

  const basePayload = {
    generatedAt: now.toISOString(),
    timezone,
    dayKey,
    latestArtifactAt: collected.latestArtifactAt,
    artifactCount: collected.artifacts.length,
    artifactsByTrack: collected.artifactsByTrack,
    artifacts: collected.artifacts,
    graphChanges,
    signature,
    reportId: null,
    graphReportId: null,
    reusedReportId: null,
  };

  const payload = writeSyncArtifacts({
    reportsDir,
    payload: basePayload,
  });

  const todaysReports = listReports(user.id, projectId, { limit: 250 }).filter(
    (report) => formatDayKey(report.date, timezone) === dayKey,
  );
  const appendMode = process.env.DIRECTIVE_WORKSPACE_REPORT_SYNC_APPEND === "1";
  const existingDirectiveReports = todaysReports.filter(
    (report) =>
      report.area === "directive-workspace" &&
      Boolean((report.metadata as Record<string, unknown>).directiveWorkspaceSync),
  );
  const latestDirectiveReport = existingDirectiveReports[0] || null;

  const existing = todaysReports.find((report) => {
    if (report.area !== "directive-workspace") return false;
    const meta = report.metadata as Record<string, unknown>;
    const syncMeta = (meta.directiveWorkspaceSync || {}) as Record<string, unknown>;
    return String(syncMeta.signature || "").trim() === signature;
  });

  let reportId: string | null = null;
  let reusedReportId: string | null = null;
  if (!appendMode && latestDirectiveReport) {
    reusedReportId = latestDirectiveReport.id;
    reportId = latestDirectiveReport.id;
  } else if (!appendMode && existing) {
    reusedReportId = existing.id;
    reportId = existing.id;
  } else {
    const report = createReport(user.id, projectId, {
      title:
        collected.artifacts.length > 0
          ? "Directive Workspace sync captured architecture progress"
          : "Directive Workspace sync captured no new artifacts",
      content: renderReportContent(payload),
      category: "maintenance",
      status: collected.artifacts.length > 0 ? "success" : "info",
      area: "directive-workspace",
      source: "Mission Control",
      topics: [
        "directive-workspace",
        "architecture",
        "sync",
        ...(graphChanges.length > 0 ? ["graph"] : []),
      ],
      metadata: {
        directiveWorkspaceSync: payload,
      },
    });
    reportId = report.id;
  }

  let graphReportId: string | null = null;
  if (graphChanges.length > 0) {
    const graphSignature = createHash("sha1")
      .update(graphChanges.join("\n"))
      .digest("hex")
      .slice(0, 16);
    const existingGraphReports = todaysReports.filter(
      (report) =>
        report.area === "graph" &&
        Boolean((report.metadata as Record<string, unknown>).directiveGraphSync),
    );
    const latestGraphReport = existingGraphReports[0] || null;
    const graphExisting = todaysReports.find((report) => {
      if (report.area !== "graph") return false;
      const meta = report.metadata as Record<string, unknown>;
      const graphMeta = (meta.directiveGraphSync || {}) as Record<string, unknown>;
      return String(graphMeta.signature || "").trim() === graphSignature;
    });

    if (!appendMode && latestGraphReport) {
      graphReportId = latestGraphReport.id;
    } else if (!appendMode && graphExisting) {
      graphReportId = graphExisting.id;
    } else {
      const graphReport = createReport(user.id, projectId, {
        title: "Graph worklog sync from workspace changes",
        content: [
          `Graph worklog sync summary (${payload.dayKey}, ${payload.timezone})`,
          `Generated: ${payload.generatedAt}`,
          `Linked directive report: ${reportId || "none"}`,
          `Graph changes: ${graphChanges.length}`,
          `Top graph paths (5): ${graphChanges.slice(0, 5).join(" | ")}`,
          `Signature: ${graphSignature}`,
          `Details: ${payload.reportPaths.latestMarkdown} | ${payload.reportPaths.latestJson}`,
        ].join("\n"),
        category: "maintenance",
        status: "info",
        area: "graph",
        source: "Mission Control",
        topics: ["graph", "codegraph", "worklog", "sync"],
        metadata: {
          directiveGraphSync: {
            generatedAt: payload.generatedAt,
            signature: graphSignature,
            graphChanges,
            linkedDirectiveWorkspaceReportId: reportId,
          },
        },
      });
      graphReportId = graphReport.id;
    }
  }

  const output: SyncPayload = {
    ...payload,
    reportId,
    graphReportId,
    reusedReportId,
  };

  fs.writeFileSync(output.reportPaths.timestampedJson, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  fs.writeFileSync(output.reportPaths.latestJson, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ ok: true, output }, null, 2)}\n`);
}

main();
