import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const REPORT_DIR = path.join(process.cwd(), "reports", "ops");
const RUNWAY_LOG = path.join(REPORT_DIR, "cutover-runway-log.json");
const RUNWAY_LATEST = path.join(REPORT_DIR, "cutover-runway-latest.json");

type RunwayEntry = {
  timestamp: string;
  dateKey: string;
  ok: boolean;
  failedChecks: string[];
};

type RunwayLog = {
  entries: RunwayEntry[];
};

function loadLog(): RunwayLog {
  if (fs.existsSync(RUNWAY_LOG)) {
    try {
      return JSON.parse(fs.readFileSync(RUNWAY_LOG, "utf8")) as RunwayLog;
    } catch {
      return { entries: [] };
    }
  }
  return { entries: [] };
}

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  // Run ops-stack and capture result
  let opsResult: { ok: boolean; checks: Array<{ command: string; ok: boolean }> };
  try {
    const output = execSync("npm run check:ops-stack", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 600_000,
    });
    // Extract JSON from output (skip npm log lines)
    const lines = output.split("\n");
    const jsonStart = lines.findIndex((l) => l.trim().startsWith("{"));
    const jsonText = lines.slice(jsonStart).join("\n");
    opsResult = JSON.parse(jsonText) as typeof opsResult;
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr || "");
    const stdout = String((error as { stdout?: string }).stdout || "");
    // Try to parse partial output
    try {
      const lines = stdout.split("\n");
      const jsonStart = lines.findIndex((l) => l.trim().startsWith("{"));
      if (jsonStart >= 0) {
        opsResult = JSON.parse(lines.slice(jsonStart).join("\n")) as typeof opsResult;
      } else {
        opsResult = { ok: false, checks: [{ command: "check:ops-stack", ok: false }] };
      }
    } catch {
      opsResult = { ok: false, checks: [{ command: "check:ops-stack", ok: false }] };
    }
  }

  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const failedChecks = (opsResult.checks || [])
    .filter((c) => !c.ok)
    .map((c) => c.command);

  const entry: RunwayEntry = {
    timestamp: now.toISOString(),
    dateKey,
    ok: opsResult.ok,
    failedChecks,
  };

  const log = loadLog();

  // Only keep one entry per dateKey (latest wins)
  const existingIndex = log.entries.findIndex((e) => e.dateKey === dateKey);
  if (existingIndex >= 0) {
    log.entries[existingIndex] = entry;
  } else {
    log.entries.push(entry);
  }

  // Keep last 30 entries max
  if (log.entries.length > 30) {
    log.entries = log.entries.slice(-30);
  }

  fs.writeFileSync(RUNWAY_LOG, JSON.stringify(log, null, 2), "utf8");

  // Compute consecutive green streak from most recent
  let consecutiveGreen = 0;
  for (let i = log.entries.length - 1; i >= 0; i--) {
    if (log.entries[i].ok) {
      consecutiveGreen++;
    } else {
      break;
    }
  }

  const latest = {
    generatedAt: now.toISOString(),
    latestEntry: entry,
    consecutiveGreenDays: consecutiveGreen,
    totalEntries: log.entries.length,
  };

  fs.writeFileSync(RUNWAY_LATEST, JSON.stringify(latest, null, 2), "utf8");

  process.stdout.write(`${JSON.stringify(latest, null, 2)}\n`);
  if (!entry.ok) process.exitCode = 1;
}

main();
