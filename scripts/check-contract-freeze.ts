import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MANIFEST_PATH = path.join(process.cwd(), "reports", "ops", "contract-freeze-manifest.json");

const PROTECTED_ROUTES = [
  // Catch-all frontend backend boundary
  "src/app/api/[...path]/route.ts",
  "src/platform/http/backend-proxy.ts",
  // Shared frontend request/store layer
  "src/features/shared/api-client.ts",
  "src/state/app-store.ts",
];

type ManifestEntry = { file: string; hash: string };
type Manifest = { generatedAt: string; entries: ManifestEntry[] };

function hashFile(filePath: string): string | null {
  const abs = path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) return null;
  const content = fs.readFileSync(abs, "utf8");
  return createHash("sha256").update(content).digest("hex");
}

function generateManifest(): Manifest {
  const entries: ManifestEntry[] = [];
  for (const file of PROTECTED_ROUTES) {
    const hash = hashFile(file);
    if (hash) {
      entries.push({ file, hash });
    }
  }
  return { generatedAt: new Date().toISOString(), entries };
}

function main() {
  const overrideEnabled = process.env.CONTRACT_FREEZE_OVERRIDE === "true";
  const mode = process.argv[2] || "check";

  if (mode === "snapshot") {
    // Generate baseline manifest
    const manifest = generateManifest();
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
    process.stdout.write(`${JSON.stringify({ ok: true, mode: "snapshot", files: manifest.entries.length, path: MANIFEST_PATH }, null, 2)}\n`);
    return;
  }

  // Check mode
  if (!fs.existsSync(MANIFEST_PATH)) {
    // No baseline exists — create one and report clean
    const manifest = generateManifest();
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: "check",
      note: "baseline manifest created (first run)",
      files: manifest.entries.length,
      changed: [],
      missing: [],
      overrideEnabled,
    }, null, 2)}\n`);
    return;
  }

  let baseline: Manifest;
  try {
    baseline = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: "manifest is malformed" }, null, 2)}\n`);
    process.exit(1);
    return;
  }

  const baselineMap = new Map(baseline.entries.map((e) => [e.file, e.hash]));
  const changed: string[] = [];
  const missing: string[] = [];

  for (const file of PROTECTED_ROUTES) {
    const currentHash = hashFile(file);
    const baselineHash = baselineMap.get(file);

    if (!currentHash) {
      missing.push(file);
    } else if (baselineHash && currentHash !== baselineHash) {
      changed.push(file);
    }
    // New files not in baseline are OK (additive)
  }

  const hasViolations = changed.length > 0 || missing.length > 0;
  const ok = !hasViolations || overrideEnabled;

  const output = {
    ok,
    mode: "check",
    baselineGeneratedAt: baseline.generatedAt,
    protectedFiles: PROTECTED_ROUTES.length,
    changed,
    missing,
    overrideEnabled,
    ...(hasViolations && overrideEnabled ? { note: "violations detected but CONTRACT_FREEZE_OVERRIDE=true" } : {}),
    ...(hasViolations && !overrideEnabled ? { action: "set CONTRACT_FREEZE_OVERRIDE=true to bypass, or run with 'snapshot' arg to update baseline" } : {}),
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
