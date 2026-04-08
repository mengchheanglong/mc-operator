import fs from "node:fs";
import path from "node:path";

const MATRIX_PATH = path.join(process.cwd(), "reports", "ops", "legacy-removal-matrix.json");

type MatrixEntry = {
  group: string;
  files: string[];
  backendAuthoritative: boolean;
  localBusinessLogic: boolean;
  writeFailFastCompliant: boolean;
  readFallbackPresent: boolean;
  removalReady: boolean;
  blockingReason: string | null;
};

type Matrix = {
  generatedAt: string;
  version: number;
  routes: MatrixEntry[];
};

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function main() {
  const minReadyRatio = envNum("LEGACY_REMOVAL_MIN_READY_RATIO", 0.5);

  if (!fs.existsSync(MATRIX_PATH)) {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: "legacy removal matrix not found" }, null, 2)}\n`);
    process.exit(1);
  }

  let matrix: Matrix;
  try {
    matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8")) as Matrix;
  } catch {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: "matrix JSON is malformed" }, null, 2)}\n`);
    process.exit(1);
    return;
  }

  const routes = Array.isArray(matrix.routes) ? matrix.routes : [];
  const total = routes.length;
  const ready = routes.filter((r) => r.removalReady);
  const blocked = routes.filter((r) => !r.removalReady);
  const readyRatio = total > 0 ? ready.length / total : 0;
  const ok = readyRatio >= minReadyRatio;

  const blockerCounts: Record<string, number> = {};
  for (const route of blocked) {
    const reason = route.blockingReason || "unknown";
    blockerCounts[reason] = (blockerCounts[reason] || 0) + 1;
  }

  const topBlockers = Object.entries(blockerCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => ({ reason, count }));

  const output = {
    ok,
    matrixGeneratedAt: matrix.generatedAt,
    total,
    removalReady: ready.length,
    blocked: blocked.length,
    readyRatio: Math.round(readyRatio * 100) / 100,
    minReadyRatio,
    topBlockers,
    blockedGroups: blocked.map((r) => ({ group: r.group, reason: r.blockingReason })),
    readyGroups: ready.map((r) => r.group),
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
