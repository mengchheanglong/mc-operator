import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { listReports } from "@/server/repositories/reports-repo";
import { findOrCreateUser } from "@/server/repositories/users-repo";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

type LatestSyncPayload = {
  dayKey?: string;
  reportId?: string | null;
  graphReportId?: string | null;
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

function todaysDirectiveArtifactsCount(input: {
  rootPath: string;
  timezone: string;
  dayKey: string;
}) {
  return collectMarkdownFiles(input.rootPath).filter((filePath) => {
    const relativePath = path.relative(input.rootPath, filePath).replace(/\\/g, "/");
    if (!isSyncRelevantArtifact(relativePath)) return false;
    try {
      const mtime = fs.statSync(filePath).mtime.getTime();
      const mtimeDayKey = formatDayKey(new Date(mtime).toISOString(), input.timezone);
      return mtimeDayKey === input.dayKey;
    } catch {
      return false;
    }
  }).length;
}

function parsePorcelainPath(line: string) {
  if (!line.trim()) return "";
  if (line.startsWith("?? ")) return line.slice(3).trim();
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
    "codegraph",
    "graph",
  ];
  return stdout
    .split(/\r?\n/)
    .map(parsePorcelainPath)
    .filter(Boolean)
    .filter((filePath) => {
      const normalized = filePath.replace(/\\/g, "/").toLowerCase();
      return graphNeedles.some((needle) => normalized.includes(needle.toLowerCase()));
    });
}

function main() {
  const now = new Date();
  const user = findOrCreateUser();
  const projectId = getControlPlaneProjectId();
  const timezone = String(user.timezone || "Asia/Bangkok");
  const directiveRoot = path.resolve(process.cwd(), "..", "directive-workspace");
  const todayKey = formatDayKey(now.toISOString(), timezone);

  const todaysArtifacts = todaysDirectiveArtifactsCount({
    rootPath: directiveRoot,
    timezone,
    dayKey: todayKey,
  });
  const graphChanges = collectGraphChanges();
  const todaysReports = listReports(user.id, projectId, { limit: 300 }).filter(
    (report) => formatDayKey(report.date, timezone) === todayKey,
  );
  const latestSyncJsonPath = path.join(
    process.cwd(),
    "reports",
    "ops",
    "directive-workspace-sync-latest.json",
  );
  const latestSyncPayload = fs.existsSync(latestSyncJsonPath)
    ? (JSON.parse(fs.readFileSync(latestSyncJsonPath, "utf8")) as LatestSyncPayload)
    : null;
  const latestSyncMatchesToday = latestSyncPayload?.dayKey === todayKey;

  const directiveReports = todaysReports.filter(
    (report) =>
      report.area === "directive-workspace" &&
      Boolean((report.metadata as Record<string, unknown>).directiveWorkspaceSync),
  );
  const graphReports = todaysReports.filter(
    (report) =>
      report.area === "graph" &&
      Boolean((report.metadata as Record<string, unknown>).directiveGraphSync),
  );

  const checks: Check[] = [];
  const hasDirectiveReportToday =
    directiveReports.length > 0 ||
    Boolean(latestSyncMatchesToday && String(latestSyncPayload?.reportId || "").trim());
  const hasGraphReportToday =
    graphReports.length > 0 ||
    Boolean(latestSyncMatchesToday && String(latestSyncPayload?.graphReportId || "").trim());

  checks.push({
    id: "directive-report-required-when-artifacts-recent",
    ok: todaysArtifacts === 0 || hasDirectiveReportToday,
    reason:
      todaysArtifacts === 0 || hasDirectiveReportToday
        ? null
        : `found ${todaysArtifacts} directive workspace markdown artifacts for ${todayKey} but no directive-workspace report for the same day`,
  });

  checks.push({
    id: "graph-report-required-when-graph-files-changed",
    ok: graphChanges.length === 0 || hasGraphReportToday,
    reason:
      graphChanges.length === 0 || hasGraphReportToday
        ? null
        : `found graph/codegraph changes in working tree but no graph-context report for ${todayKey}`,
  });
  checks.push({
    id: "latest-sync-artifact-exists",
    ok: todaysArtifacts === 0 || fs.existsSync(latestSyncJsonPath),
    reason:
      todaysArtifacts === 0 || fs.existsSync(latestSyncJsonPath)
        ? null
        : `missing latest sync artifact: ${latestSyncJsonPath}`,
  });

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      timezone,
      todayKey,
      todaysDirectiveArtifacts: todaysArtifacts,
      graphChanges: graphChanges.length,
      directiveReportsToday: directiveReports.length,
      graphReportsToday: graphReports.length,
      latestSyncMatchesToday,
      totalChecks: checks.length,
      failedChecks: failed.length,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.ok) process.exit(1);
}

main();
