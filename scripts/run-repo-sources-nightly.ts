import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { findOrCreateUser } from "@/server/repositories/users-repo";
import { createQuest, listQuests } from "@/server/repositories/quests-repo";
import { createReport } from "@/server/repositories/reports-repo";
import { getControlPlaneProjectId } from "@/server/projects/workspace-projects";
import { runRepoSourcesSync } from "./repo-sources-lib";
import { getRepoSourcesScriptPaths } from "./repo-sources-paths";

type NightlyState = {
  generatedAt: string;
  blockedCount: number;
  failureSignature: string;
};

function reportDir() {
  return path.join(process.cwd(), "reports", "ops");
}

function stateFilePath() {
  return path.join(reportDir(), "repo-sources-nightly-state.json");
}

function readState(): NightlyState | null {
  const file = stateFilePath();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as NightlyState;
  } catch {
    return null;
  }
}

function writeState(state: NightlyState) {
  fs.mkdirSync(reportDir(), { recursive: true });
  fs.writeFileSync(stateFilePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function toTimestampForFile(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function createFailureSignature(input: { blockedCount: number; blockedEntries: Array<{ path: string; state: string }> }) {
  if (input.blockedCount <= 0 || input.blockedEntries.length === 0) {
    return "healthy";
  }
  const raw = input.blockedEntries
    .map((entry) => `${entry.path}|${entry.state}`)
    .sort()
    .join("\n");
  return createHash("sha1").update(raw).digest("hex").slice(0, 12);
}

function resolveExistingQuest(input: { userId: string; projectId: string; dedupeKey: string }) {
  const open = listQuests(input.userId, input.projectId, {
    status: "open",
    area: "runtime-reliability",
    limit: 200,
  });
  return open.find((quest) => quest.goal.includes(input.dedupeKey)) || null;
}

function main() {
  const now = new Date();
  const user = findOrCreateUser();
  const projectId = getControlPlaneProjectId();
  const paths = getRepoSourcesScriptPaths();
  const sync = runRepoSourcesSync({
    apply: false,
    fetch: true,
    registryPath: paths.registryPath,
    workspaceRoot: paths.workspaceRoot,
    reportsDir: paths.reportsDir,
  });

  const blockedEntries = sync.repositories
    .filter((entry) => ["pull_failed", "fetch_failed", "missing_path", "not_git"].includes(entry.state))
    .map((entry) => ({
      path: entry.path,
      state: entry.state,
      error: entry.error,
    }));

  const blockedCount = sync.summary.blocked;
  const failureSignature = createFailureSignature({
    blockedCount,
    blockedEntries,
  });
  const previous = readState();

  let questAction: {
    action: "none" | "created" | "reused";
    questId: string | null;
    dedupeKey: string | null;
  } = {
    action: "none",
    questId: null,
    dedupeKey: null,
  };

  const signatureChanged = previous?.failureSignature !== failureSignature
    || previous?.blockedCount !== blockedCount;

  if (blockedCount > 0 && signatureChanged) {
    const dedupeKey = `repo-sources-nightly:${failureSignature}`;
    const existing = resolveExistingQuest({
      userId: user.id,
      projectId,
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
        projectId,
        `Investigate repo-source nightly regression [${dedupeKey}]`,
        "normal",
        ["repo-sources", "nightly", "ops"],
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

  writeState({
    generatedAt: now.toISOString(),
    blockedCount,
    failureSignature,
  });

  const payload = {
    generatedAt: now.toISOString(),
    ok: blockedCount === 0,
    blockedCount,
    failureSignature,
    signatureChanged,
    questAction,
    reports: sync.reports,
    summary: sync.summary,
    blockedEntries,
    previousState: previous,
  };

  const reportsDir = reportDir();
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = toTimestampForFile(now);
  const timestamped = path.join(reportsDir, `repo-sources-nightly-${stamp}.json`);
  const latest = path.join(reportsDir, "repo-sources-nightly-latest.json");
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(timestamped, serialized, "utf8");
  fs.writeFileSync(latest, serialized, "utf8");

  createReport(user.id, projectId, {
    title: blockedCount === 0 ? "Repo sources nightly passed" : "Repo sources nightly detected blocked entries",
    content: [
      `generatedAt: ${now.toISOString()}`,
      `blockedCount: ${blockedCount}`,
      `failureSignature: ${failureSignature}`,
      `signatureChanged: ${signatureChanged}`,
      `questAction: ${questAction.action}${questAction.questId ? ` (${questAction.questId})` : ""}`,
      `latestSyncReport: ${sync.reports.latest}`,
      blockedEntries.length > 0
        ? `blockedEntries: ${blockedEntries.map((entry) => `${entry.path} [${entry.state}]`).join("; ")}`
        : "blockedEntries: none",
    ].join("\n"),
    category: "maintenance",
    status: blockedCount === 0 ? "success" : "warning",
    area: "runtime-reliability",
    source: "Mission Control",
    topics: ["repo-sources", "nightly", "ops"],
    linkedQuestId: questAction.questId || undefined,
    metadata: {
      repoSourcesNightly: payload,
    },
  });

  process.stdout.write(
    `${JSON.stringify({ ok: blockedCount === 0, blockedCount, failureSignature, questAction, reports: { timestamped, latest } }, null, 2)}\n`,
  );
  if (blockedCount > 0) {
    process.exitCode = 1;
  }
}

main();
