import fs from "node:fs";
import path from "node:path";

const RUNWAY_LOG = path.join(process.cwd(), "reports", "ops", "cutover-runway-log.json");

type RunwayEntry = {
  timestamp: string;
  dateKey: string;
  ok: boolean;
  failedChecks: string[];
};

type RunwayLog = {
  entries: RunwayEntry[];
};

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const requiredDays = Math.max(1, Math.floor(envNum("CUTOVER_RUNWAY_DAYS", 7)));

  if (!fs.existsSync(RUNWAY_LOG)) {
    const output = {
      ok: false,
      consecutiveGreenDays: 0,
      requiredDays,
      daysRemaining: requiredDays,
      reason: "no runway log found; run ops:runway:record first",
      entries: [],
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exit(1);
  }

  let log: RunwayLog;
  try {
    log = JSON.parse(fs.readFileSync(RUNWAY_LOG, "utf8")) as RunwayLog;
  } catch {
    const output = {
      ok: false,
      consecutiveGreenDays: 0,
      requiredDays,
      daysRemaining: requiredDays,
      reason: "runway log is malformed",
      entries: [],
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exit(1);
  }

  const entries = Array.isArray(log.entries) ? log.entries : [];

  // Count consecutive green from most recent
  let consecutiveGreen = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].ok) {
      consecutiveGreen++;
    } else {
      break;
    }
  }

  const daysRemaining = Math.max(0, requiredDays - consecutiveGreen);
  const ok = consecutiveGreen >= requiredDays;

  const recentEntries = entries.slice(-requiredDays).map((e) => ({
    dateKey: e.dateKey,
    ok: e.ok,
    failedChecks: e.failedChecks,
  }));

  const output = {
    ok,
    consecutiveGreenDays: consecutiveGreen,
    requiredDays,
    daysRemaining,
    reason: ok
      ? `${consecutiveGreen} consecutive green days meets ${requiredDays}-day threshold`
      : `${consecutiveGreen}/${requiredDays} consecutive green days; ${daysRemaining} more needed`,
    recentEntries,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
