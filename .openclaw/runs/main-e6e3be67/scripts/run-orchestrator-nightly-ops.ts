import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

function run(command: string) {
  try {
    const output = execSync(command, { encoding: "utf8", stdio: "pipe" });
    return { command, ok: true, output: output.trim() };
  } catch (error) {
    const message = String((error as Error & { stdout?: string; stderr?: string }).message || "");
    return { command, ok: false, output: message.slice(0, 6000) };
  }
}

function main() {
  const generatedAt = new Date().toISOString();
  const reliability = run("npm run reliability:orchestrator");
  const readiness = run("npm run check:orchestrator-readiness");

  const summary = {
    generatedAt,
    ok: reliability.ok && readiness.ok,
    steps: [reliability, readiness],
  };

  const dir = path.join(process.cwd(), "reports", "ops");
  mkdirSync(dir, { recursive: true });
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const datedPath = path.join(dir, `orchestrator-nightly-${stamp}.json`);
  const latestPath = path.join(dir, "orchestrator-nightly-latest.json");
  const text = `${JSON.stringify(summary, null, 2)}\n`;
  writeFileSync(datedPath, text, "utf8");
  writeFileSync(latestPath, text, "utf8");

  process.stdout.write(`${JSON.stringify({ ok: summary.ok, latestPath, datedPath }, null, 2)}\n`);
  if (!summary.ok) process.exit(1);
}

main();
