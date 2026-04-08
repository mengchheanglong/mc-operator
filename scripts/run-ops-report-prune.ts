import fs from "node:fs";
import path from "node:path";

const OPS_REPORT_PATTERNS = [
  /^canary-.*\.json$/i,
  /^orchestrator-nightly-.*\.json$/i,
  /^orchestrator-reliability-.*\.json$/i,
  /^nightly-ops-bundle-.*\.json$/i,
  /^nightly-step-hotspots-.*\.json$/i,
  /^nightly-step-hotspots-summary-.*\.md$/i,
  /^nightly-step-hotspots-alerts-.*\.json$/i,
  /^nightly-ops-summary-.*\.md$/i,
  /^ops-health-.*\.json$/i,
  /^workspace-global-health-.*\.json$/i,
  /^repo-sources-nightly-.*\.json$/i,
  /^repo-sync-.*\.json$/i,
  /^directive-integration-proof-.*\.md$/i,
  /^directive-lifecycle-proof-.*\.md$/i,
  /^desloppify-prototype-.*\.md$/i,
  /^tooling-audit-.*\.md$/i,
  /^agency-agents-.*\.md$/i,
  /^tool-admission-.*\.json$/i,
];

const LATEST_BASENAMES = new Set([
  "canary-latest.json",
  "orchestrator-nightly-latest.json",
  "orchestrator-reliability-latest.json",
  "nightly-ops-bundle-latest.json",
  "nightly-step-hotspots-latest.json",
  "nightly-step-hotspots-summary-latest.md",
  "nightly-step-hotspots-alerts-latest.json",
  "nightly-ops-summary-latest.md",
  "ops-health-latest.json",
  "workspace-global-health-latest.json",
  "repo-sources-nightly-latest.json",
  "repo-sync-latest.json",
]);
const SNAPSHOT_INDEX_FILE = "snapshots-index.json";
const SNAPSHOT_POINTER_FILE = "latest.json";
const MIN_SNAPSHOT_KEEP_COUNT = 4;
const DEFAULT_SNAPSHOT_KEEP_COUNT = 40;

interface SnapshotSummary {
  snapshotId: string;
  snapshotPath: string;
  manifestPath: string;
  createdAt: string;
}

interface SnapshotIndex {
  version: 1;
  snapshots: SnapshotSummary[];
}

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isManagedOpsReport(name: string) {
  return OPS_REPORT_PATTERNS.some((pattern) => pattern.test(name));
}

function parseSnapshotIndex(indexPath: string): SnapshotIndex {
  if (!fs.existsSync(indexPath)) {
    return { version: 1, snapshots: [] };
  }
  try {
    const raw = fs.readFileSync(indexPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<SnapshotIndex>;
    if (parsed?.version === 1 && Array.isArray(parsed.snapshots)) {
      return {
        version: 1,
        snapshots: parsed.snapshots
          .filter((entry) => entry && typeof entry.snapshotId === "string")
          .map((entry) => ({
            snapshotId: String(entry.snapshotId),
            snapshotPath: String(entry.snapshotPath || ""),
            manifestPath: String(entry.manifestPath || ""),
            createdAt: String(entry.createdAt || ""),
          })),
      };
    }
  } catch {
    return { version: 1, snapshots: [] };
  }
  return { version: 1, snapshots: [] };
}

function snapshotTimestamp(value: string) {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function pruneAgencySnapshots(reportsDir: string) {
  const snapshotRoot = path.join(reportsDir, "agency-agents-snapshots");
  if (!fs.existsSync(snapshotRoot)) {
    return {
      snapshotRoot,
      snapshotKeepCount: 0,
      prunedSnapshotCount: 0,
      prunedSnapshots: [] as string[],
      indexTrimmedBy: 0,
    };
  }

  const snapshotKeepCount = Math.max(
    MIN_SNAPSHOT_KEEP_COUNT,
    Math.floor(envNum("MISSION_CONTROL_AGENCY_SNAPSHOT_MAX_COUNT", DEFAULT_SNAPSHOT_KEEP_COUNT)),
  );
  const dirs = fs.readdirSync(snapshotRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(snapshotRoot, entry.name);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(fullPath).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      return { name: entry.name, fullPath, mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || left.name.localeCompare(right.name));

  const keepNames = new Set<string>();
  for (let idx = 0; idx < dirs.length; idx += 1) {
    const dir = dirs[idx];
    if (!dir) continue;
    if (idx < snapshotKeepCount || idx < MIN_SNAPSHOT_KEEP_COUNT) {
      keepNames.add(dir.name);
    }
  }

  const prunedSnapshots: string[] = [];
  for (const dir of dirs) {
    if (keepNames.has(dir.name)) continue;
    try {
      fs.rmSync(dir.fullPath, { recursive: true, force: true });
      prunedSnapshots.push(dir.name);
    } catch {
      // ignore single directory delete failure
    }
  }

  const remainingNames = new Set(
    fs.readdirSync(snapshotRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );

  const indexPath = path.join(snapshotRoot, SNAPSHOT_INDEX_FILE);
  const pointerPath = path.join(snapshotRoot, SNAPSHOT_POINTER_FILE);
  const index = parseSnapshotIndex(indexPath);
  const filteredSnapshots = index.snapshots.filter((entry) => {
    const basename = path.basename(entry.snapshotPath || "");
    return remainingNames.has(basename);
  });
  const indexTrimmedBy = Math.max(0, index.snapshots.length - filteredSnapshots.length);

  if (indexTrimmedBy > 0 || !fs.existsSync(indexPath)) {
    fs.writeFileSync(
      indexPath,
      `${JSON.stringify({ version: 1, snapshots: filteredSnapshots }, null, 2)}\n`,
      "utf8",
    );
  }

  if (filteredSnapshots.length === 0) {
    if (fs.existsSync(pointerPath)) {
      fs.rmSync(pointerPath, { force: true });
    }
  } else {
    const newestSnapshot = [...filteredSnapshots]
      .sort((left, right) => {
        const delta = snapshotTimestamp(right.createdAt) - snapshotTimestamp(left.createdAt);
        if (delta !== 0) return delta;
        return left.snapshotId.localeCompare(right.snapshotId);
      })[0];
    if (newestSnapshot) {
      fs.writeFileSync(pointerPath, `${JSON.stringify(newestSnapshot, null, 2)}\n`, "utf8");
    }
  }

  return {
    snapshotRoot,
    snapshotKeepCount,
    prunedSnapshotCount: prunedSnapshots.length,
    prunedSnapshots,
    indexTrimmedBy,
  };
}

function main() {
  const retentionDays = Math.max(3, Math.floor(envNum("MISSION_CONTROL_OPS_REPORT_RETENTION_DAYS", 14)));
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const reportsDir = path.join(process.cwd(), "reports", "ops");
  if (!fs.existsSync(reportsDir)) {
    process.stdout.write(`${JSON.stringify({ ok: true, prunedCount: 0, reportsDir }, null, 2)}\n`);
    return;
  }

  const now = Date.now();
  const files = fs.readdirSync(reportsDir);
  const pruned: string[] = [];

  for (const file of files) {
    if (!isManagedOpsReport(file)) continue;
    if (LATEST_BASENAMES.has(file)) continue;
    const fullPath = path.join(reportsDir, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (now - stat.mtimeMs <= retentionMs) continue;
    try {
      fs.unlinkSync(fullPath);
      pruned.push(file);
    } catch {
      // ignore single file delete failure
    }
  }
  const snapshotPrune = pruneAgencySnapshots(reportsDir);

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      reportsDir,
      retentionDays,
      prunedCount: pruned.length,
      pruned: pruned.slice(0, 50),
      snapshotPrune: {
        root: snapshotPrune.snapshotRoot,
        keepCount: snapshotPrune.snapshotKeepCount,
        prunedCount: snapshotPrune.prunedSnapshotCount,
        pruned: snapshotPrune.prunedSnapshots.slice(0, 25),
        indexTrimmedBy: snapshotPrune.indexTrimmedBy,
      },
    }, null, 2)}\n`,
  );
}

main();
