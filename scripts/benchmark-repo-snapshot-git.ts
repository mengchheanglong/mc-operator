import { execFileSync } from "child_process";
import {
  findWorkspaceProject,
  getControlPlaneProjectId,
  type WorkspaceProject,
} from "@/server/projects/workspace-projects";

type GitFileChange = {
  path: string;
  status: string;
};

type GitCommitSummary = {
  hash: string;
  subject: string;
  date: string;
};

type GitSnapshotLike = {
  available: boolean;
  branch: string | null;
  summary: string;
  isDirty: boolean;
  changedFiles: GitFileChange[];
  stagedCount: number;
  modifiedCount: number;
  untrackedCount: number;
  recentCommits: GitCommitSummary[];
  aheadCount: number;
  behindCount: number;
};

type BenchmarkRun = {
  ms: number;
};

function runGit(project: WorkspaceProject, args: string[]) {
  try {
    return execFileSync("git", ["-C", project.rootPath, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function parseGitBranchStatus(line: string) {
  const content = line.replace(/^##\s*/, "").trim();
  if (!content) {
    return null;
  }

  const branch =
    content.split("...")[0]?.split(" [")[0]?.trim() || content;
  const aheadMatch = content.match(/\bahead (\d+)/);
  const behindMatch = content.match(/\bbehind (\d+)/);

  return {
    branch,
    aheadCount: Number.parseInt(aheadMatch?.[1] || "0", 10) || 0,
    behindCount: Number.parseInt(behindMatch?.[1] || "0", 10) || 0,
  };
}

function collectLegacyGitSnapshot(project: WorkspaceProject): GitSnapshotLike {
  const branch = runGit(project, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch) {
    return {
      available: false,
      branch: null,
      summary: "Git metadata unavailable for this project.",
      isDirty: false,
      changedFiles: [],
      stagedCount: 0,
      modifiedCount: 0,
      untrackedCount: 0,
      recentCommits: [],
      aheadCount: 0,
      behindCount: 0,
    };
  }

  const rawStatus = runGit(project, ["status", "--short"]) || "";
  const statusLines = rawStatus.split("\n").filter(Boolean);
  const changedFiles: GitFileChange[] = statusLines.map((line) => ({
    status: line.slice(0, 2).trim() || "??",
    path: line.slice(3).trim(),
  }));

  let stagedCount = 0;
  let modifiedCount = 0;
  let untrackedCount = 0;

  for (const change of statusLines) {
    const staged = change[0];
    const unstaged = change[1];

    if (staged && staged !== " " && staged !== "?") {
      stagedCount += 1;
    }
    if (unstaged && unstaged !== " " && unstaged !== "?") {
      modifiedCount += 1;
    }
    if (staged === "?" || unstaged === "?") {
      untrackedCount += 1;
    }
  }

  const recentCommits = (runGit(project, [
    "log",
    "--pretty=format:%h%x09%cs%x09%s",
    "-n",
    "5",
  ]) || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, date, ...subjectParts] = line.split("\t");
      return {
        hash,
        date,
        subject: subjectParts.join("\t"),
      };
    });

  let aheadCount = 0;
  let behindCount = 0;
  const aheadBehind = runGit(project, [
    "rev-list",
    "--left-right",
    "--count",
    "@{upstream}...HEAD",
  ]);
  if (aheadBehind) {
    const [behindRaw, aheadRaw] = aheadBehind.split(/\s+/);
    behindCount = Number.parseInt(behindRaw || "0", 10) || 0;
    aheadCount = Number.parseInt(aheadRaw || "0", 10) || 0;
  }

  const dirtyCount = changedFiles.length;
  const summaryParts = [`Branch ${branch}`];
  if (dirtyCount > 0) {
    summaryParts.push(`${dirtyCount} changed files`);
  } else {
    summaryParts.push("working tree clean");
  }
  if (aheadCount > 0 || behindCount > 0) {
    summaryParts.push(`ahead ${aheadCount} / behind ${behindCount}`);
  }

  return {
    available: true,
    branch,
    summary: summaryParts.join(" - "),
    isDirty: dirtyCount > 0,
    changedFiles: changedFiles.slice(0, 10),
    stagedCount,
    modifiedCount,
    untrackedCount,
    recentCommits,
    aheadCount,
    behindCount,
  };
}

function collectConsolidatedGitSnapshot(project: WorkspaceProject): GitSnapshotLike {
  const rawStatusWithBranch = runGit(project, [
    "status",
    "--porcelain=1",
    "--branch",
  ]);
  if (!rawStatusWithBranch) {
    return {
      available: false,
      branch: null,
      summary: "Git metadata unavailable for this project.",
      isDirty: false,
      changedFiles: [],
      stagedCount: 0,
      modifiedCount: 0,
      untrackedCount: 0,
      recentCommits: [],
      aheadCount: 0,
      behindCount: 0,
    };
  }

  const statusLines = rawStatusWithBranch.split("\n").filter(Boolean);
  const branchStatus = statusLines[0]?.startsWith("## ")
    ? parseGitBranchStatus(statusLines.shift() || "")
    : null;
  if (statusLines.length > 0) {
    statusLines[0] = statusLines[0].trimStart();
  }
  const branch = branchStatus?.branch || "HEAD";
  const changedFiles: GitFileChange[] = statusLines.map((line) => ({
    status: line.slice(0, 2).trim() || "??",
    path: line.slice(3).trim(),
  }));

  let stagedCount = 0;
  let modifiedCount = 0;
  let untrackedCount = 0;

  for (const change of statusLines) {
    const staged = change[0];
    const unstaged = change[1];

    if (staged && staged !== " " && staged !== "?") {
      stagedCount += 1;
    }
    if (unstaged && unstaged !== " " && unstaged !== "?") {
      modifiedCount += 1;
    }
    if (staged === "?" || unstaged === "?") {
      untrackedCount += 1;
    }
  }

  const recentCommits = (runGit(project, [
    "log",
    "--pretty=format:%h%x09%cs%x09%s",
    "-n",
    "5",
  ]) || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, date, ...subjectParts] = line.split("\t");
      return {
        hash,
        date,
        subject: subjectParts.join("\t"),
      };
    });

  const aheadCount = branchStatus?.aheadCount || 0;
  const behindCount = branchStatus?.behindCount || 0;
  const dirtyCount = changedFiles.length;
  const summaryParts = [`Branch ${branch}`];
  if (dirtyCount > 0) {
    summaryParts.push(`${dirtyCount} changed files`);
  } else {
    summaryParts.push("working tree clean");
  }
  if (aheadCount > 0 || behindCount > 0) {
    summaryParts.push(`ahead ${aheadCount} / behind ${behindCount}`);
  }

  return {
    available: true,
    branch,
    summary: summaryParts.join(" - "),
    isDirty: dirtyCount > 0,
    changedFiles: changedFiles.slice(0, 10),
    stagedCount,
    modifiedCount,
    untrackedCount,
    recentCommits,
    aheadCount,
    behindCount,
  };
}

function averageMs(runs: BenchmarkRun[]) {
  return runs.reduce((sum, run) => sum + run.ms, 0) / runs.length;
}

function snapshotsMatch(left: GitSnapshotLike, right: GitSnapshotLike) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10) || 5;
  const project = findWorkspaceProject(getControlPlaneProjectId());
  if (!project) {
    throw new Error("control plane project not found");
  }

  const legacySnapshot = collectLegacyGitSnapshot(project);
  const consolidatedSnapshot = collectConsolidatedGitSnapshot(project);
  if (!snapshotsMatch(legacySnapshot, consolidatedSnapshot)) {
    throw new Error("consolidated git snapshot diverged from legacy output");
  }

  const legacyRuns: BenchmarkRun[] = [];
  const consolidatedRuns: BenchmarkRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const legacyStarted = performance.now();
    collectLegacyGitSnapshot(project);
    legacyRuns.push({ ms: performance.now() - legacyStarted });

    const consolidatedStarted = performance.now();
    collectConsolidatedGitSnapshot(project);
    consolidatedRuns.push({ ms: performance.now() - consolidatedStarted });
  }

  const legacyAvg = averageMs(legacyRuns);
  const consolidatedAvg = averageMs(consolidatedRuns);

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        iterations,
        parity: {
          ok: true,
          branch: legacySnapshot.branch,
          changedFiles: legacySnapshot.changedFiles.length,
          aheadCount: legacySnapshot.aheadCount,
          behindCount: legacySnapshot.behindCount,
        },
        legacyRuns,
        consolidatedRuns,
        legacyAvgMs: Number(legacyAvg.toFixed(2)),
        consolidatedAvgMs: Number(consolidatedAvg.toFixed(2)),
        deltaMs: Number((consolidatedAvg - legacyAvg).toFixed(2)),
        improvementPercent: Number(
          (((legacyAvg - consolidatedAvg) / legacyAvg) * 100).toFixed(1),
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
