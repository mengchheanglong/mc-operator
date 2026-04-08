import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { listAvailableProjects } from "@/server/context/project-context";
import { findOrCreateUser } from "@/server/repositories/users-repo";
import { createQuest, listQuests } from "@/server/repositories/quests-repo";
import { createReport } from "@/server/repositories/reports-repo";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";

type AvailableProject = ReturnType<typeof listAvailableProjects>[number];

type CommandResult = {
  id: string;
  command: string;
  cwd: string;
  ok: boolean;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
};

type ProjectHealthResult = {
  id: string;
  name: string;
  category: string;
  rootPath: string;
  isControlPlane: boolean;
  hasGit: boolean;
  hasPackageJson: boolean;
  checks: CommandResult[];
  ok: boolean;
};

function normalizePath(input: string) {
  return path.resolve(input).replace(/\\/g, "/").toLowerCase();
}

function runCommand(input: {
  id: string;
  command: string;
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}): CommandResult {
  const started = Date.now();
  const proc = spawnSync(input.command, {
    cwd: input.cwd,
    shell: true,
    windowsHide: true,
    encoding: "utf8",
    timeout: input.timeoutMs ?? 180_000,
    env: { ...process.env, ...(input.env || {}) },
  });

  const exitCode = proc.status ?? 1;
  return {
    id: input.id,
    command: input.command,
    cwd: input.cwd,
    ok: exitCode === 0,
    exitCode,
    durationMs: Date.now() - started,
    stdout: String(proc.stdout || "").trim(),
    stderr: String(proc.stderr || "").trim(),
  };
}

function createStaticCheck(input: {
  id: string;
  command: string;
  cwd: string;
  stdout?: string;
  stderr?: string;
}): CommandResult {
  return {
    id: input.id,
    command: input.command,
    cwd: input.cwd,
    ok: true,
    exitCode: 0,
    durationMs: 0,
    stdout: input.stdout || "",
    stderr: input.stderr || "",
  };
}

function compact(text: string, maxLen: number) {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLen - 3))}...`;
}

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function failureSignals(input: { runtime: CommandResult[]; projects: ProjectHealthResult[] }) {
  const runtimeSignals = input.runtime.filter((check) => !check.ok).map((check) => `runtime:${check.id}`);
  const projectSignals = input.projects.flatMap((project) =>
    project.checks
      .filter((check) => check.id !== "git-status-short" && !check.ok)
      .map((check) => `project:${project.id}:${check.id}`),
  );
  return [...runtimeSignals, ...projectSignals].sort();
}

function createFailureDedupeKey(signals: string[]) {
  const digest = createHash("sha1").update(signals.join("|")).digest("hex").slice(0, 12);
  return `workspace-health:${digest}`;
}

function resolveWorkspaceHealthQuest(input: { userId: string; projectId: string; dedupeKey: string }) {
  const open = listQuests(input.userId, input.projectId, {
    status: "open",
    area: "runtime-reliability",
    limit: 200,
  });

  return open.find((quest) => quest.goal.includes(input.dedupeKey)) || null;
}

function createProjectChecks(rootPath: string, isControlPlane: boolean, hasGit: boolean): CommandResult[] {
  const checks: CommandResult[] = [];

  if (hasGit) {
    const gitRootCheck = runCommand({
      id: "git-rev-parse",
      command: "git rev-parse --show-toplevel",
      cwd: rootPath,
      timeoutMs: 30_000,
    });
    const gitRootMatches =
      gitRootCheck.ok && normalizePath(gitRootCheck.stdout) === normalizePath(rootPath);

    checks.push({
      ...gitRootCheck,
      ok: gitRootMatches,
      stderr: gitRootCheck.ok && !gitRootMatches
        ? `git_root_mismatch: expected=${rootPath} actual=${gitRootCheck.stdout}`
        : gitRootCheck.stderr,
    });

    if (gitRootMatches) {
      checks.push(
        runCommand({
          id: "git-status-short",
          command: "git status --short",
          cwd: rootPath,
          timeoutMs: 60_000,
        }),
      );
    }
  } else {
    checks.push(
      createStaticCheck({
        id: "git-rev-parse",
        command: "git repo root check",
        cwd: rootPath,
        stdout: "skipped_non_repo_project",
      }),
    );
  }

  if (isControlPlane) {
    checks.push(
      runCommand({
        id: "orchestrator-readiness",
        command: "npm run check:orchestrator-readiness",
        cwd: rootPath,
        timeoutMs: 240_000,
        env: {
          MISSION_CONTROL_READINESS_SKIP_NIGHTLY_GATES: "true",
        },
      }),
    );
    checks.push(
      runCommand({
        id: "canary-health",
        command: "npm run check:canary-health",
        cwd: rootPath,
        timeoutMs: 120_000,
      }),
    );
  }

  return checks;
}

function summarizeProject(project: AvailableProject): ProjectHealthResult {
  const checks = createProjectChecks(project.rootPath, project.isControlPlane, project.hasGit);
  const requiredChecks = checks.filter((item) => item.id !== "git-status-short");

  return {
    id: project.id,
    name: project.name,
    category: project.category,
    rootPath: project.rootPath,
    isControlPlane: project.isControlPlane,
    hasGit: project.hasGit,
    hasPackageJson: project.hasPackageJson,
    checks,
    ok: requiredChecks.every((item) => item.ok),
  };
}

function main() {
  const now = new Date();
  const workspaceRoot = path.resolve(process.cwd(), "..");
  const openclawRoot = path.resolve(process.cwd(), "..", "..");
  const user = findOrCreateUser();
  const controlPlaneProjectId = getControlPlaneProjectId();

  const runtimeChecks = [
    runCommand({
      id: "gateway-status",
      command: "openclaw gateway status",
      cwd: openclawRoot,
      timeoutMs: 60_000,
    }),
    runCommand({
      id: "channels-probe",
      command: "openclaw channels status --probe --json",
      cwd: openclawRoot,
      timeoutMs: 60_000,
    }),
    runCommand({
      id: "devices-list",
      command: "openclaw devices list --json",
      cwd: openclawRoot,
      timeoutMs: 60_000,
    }),
    runCommand({
      id: "repo-sources-check",
      command: "npm run ops:repo-sources:check",
      cwd: process.cwd(),
      timeoutMs: 240_000,
    }),
  ];

  const projects = listAvailableProjects();
  const projectResults = projects.map(summarizeProject);

  const runtimeOk = runtimeChecks.every((item) => item.ok);
  const projectsOk = projectResults.every((item) => item.ok);
  const ok = runtimeOk && projectsOk;

  const signals = failureSignals({ runtime: runtimeChecks, projects: projectResults });
  const dedupeKey = signals.length > 0 ? createFailureDedupeKey(signals) : null;
  const failureClass = signals.length > 0 ? signals.join("+") : null;

  let questAction: {
    action: "none" | "created" | "reused";
    questId: string | null;
    dedupeKey: string | null;
  } = {
    action: "none",
    questId: null,
    dedupeKey: dedupeKey,
  };

  if (!ok && dedupeKey) {
    const existing = resolveWorkspaceHealthQuest({
      userId: user.id,
      projectId: controlPlaneProjectId,
      dedupeKey,
    });

    if (existing) {
      questAction = {
        action: "reused",
        questId: existing.id,
        dedupeKey,
      };
    } else {
      const quest = createQuest(
        user.id,
        controlPlaneProjectId,
        `Investigate workspace global health regression [${dedupeKey}]`,
        "normal",
        ["workspace-health", "reliability", "ops"],
        "open",
        "runtime-reliability",
      );
      questAction = {
        action: "created",
        questId: quest.id,
        dedupeKey,
      };
    }
  }

  const payload = {
    generatedAt: now.toISOString(),
    ok,
    workspaceRoot,
    openclawRoot,
    summary: {
      runtimeChecks: {
        total: runtimeChecks.length,
        passed: runtimeChecks.filter((item) => item.ok).length,
      },
      projects: {
        total: projectResults.length,
        healthy: projectResults.filter((item) => item.ok).length,
      },
    },
    failureClass,
    questAction,
    runtimeChecks: runtimeChecks.map((item) => ({
      ...item,
      stdout: compact(item.stdout, 1200),
      stderr: compact(item.stderr, 800),
    })),
    projects: projectResults.map((project) => ({
      ...project,
      checks: project.checks.map((item) => ({
        ...item,
        stdout: compact(item.stdout, 1200),
        stderr: compact(item.stderr, 800),
      })),
    })),
  };

  const reportsDir = path.join(process.cwd(), "reports", "ops");
  mkdirSync(reportsDir, { recursive: true });

  const stamp = toTimestampForFile(now);
  const timestamped = path.join(reportsDir, `workspace-global-health-${stamp}.json`);
  const latest = path.join(reportsDir, "workspace-global-health-latest.json");
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  writeFileSync(timestamped, serialized, "utf8");
  writeFileSync(latest, serialized, "utf8");

  const reportContent = [
    `Workspace global health: ${ok ? "ok" : "failed"}`,
    `generatedAt: ${now.toISOString()}`,
    "",
    `runtime checks: ${runtimeChecks.filter((item) => item.ok).length}/${runtimeChecks.length}`,
    `projects healthy: ${projectResults.filter((item) => item.ok).length}/${projectResults.length}`,
    "",
    `latest report: ${latest}`,
    dedupeKey ? `dedupeKey: ${dedupeKey}` : "",
    failureClass ? `failureClass: ${failureClass}` : "",
  ].filter(Boolean).join("\n");

  createReport(user.id, controlPlaneProjectId, {
    title: ok ? "Workspace global health passed" : "Workspace global health failed",
    content: reportContent,
    category: "maintenance",
    status: ok ? "success" : "warning",
    area: "runtime-reliability",
    linkedQuestId: questAction.questId ?? undefined,
    source: "Mission Control",
    topics: ["workspace-health", "nightly", "ops"],
    metadata: {
      workspaceHealth: {
        ok,
        generatedAt: now.toISOString(),
        latestReportPath: latest,
        dedupeKey,
        failureClass,
        questAction,
      },
    },
  });

  process.stdout.write(
    `${JSON.stringify({ ok, reports: { timestamped, latest }, summary: payload.summary, questAction }, null, 2)}\n`,
  );

  if (!ok) {
    process.exit(1);
  }
}

main();
