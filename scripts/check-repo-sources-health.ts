import { readRepoSourcesLatestReport } from "../src/server/services/repo-sources-report-service.ts";

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const maxAgeHours = Math.max(1, Math.floor(envNum("MISSION_CONTROL_REPO_SOURCES_MAX_AGE_HOURS", 24)));
  const snapshot = readRepoSourcesLatestReport(process.cwd(), { maxAgeHours });
  const blockingStates = new Set(["missing_path", "pull_failed"]);
  const actionableBlockedEntries = snapshot.blockedEntries.filter(
    (entry) => blockingStates.has(entry.state),
  );
  const ignoredNotGitEntries = snapshot.blockedEntries.filter(
    (entry) => entry.state === "not_git",
  );
  const nonBlockingFetchEntries = snapshot.blockedEntries.filter(
    (entry) => entry.state === "fetch_failed",
  );

  const ok = snapshot.available
    && !snapshot.stale
    && actionableBlockedEntries.length === 0;

  const output = {
    ok,
    available: snapshot.available,
    generatedAt: snapshot.generatedAt,
    stale: snapshot.stale,
    maxAgeHours: snapshot.maxAgeHours,
    ageMinutes: snapshot.ageMinutes,
    summary: snapshot.summary,
    actionableBlockedEntries: actionableBlockedEntries.slice(0, 10),
    nonBlockingFetchEntries: nonBlockingFetchEntries.slice(0, 10),
    ignoredNotGitEntries: ignoredNotGitEntries.slice(0, 10),
    reportPath: "reports/ops/repo-sync-latest.json",
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
