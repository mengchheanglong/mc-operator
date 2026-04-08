import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { findOrCreateUser } from "../src/server/repositories/users-repo";
import { resolveProjectById } from "../src/server/context/project-context";
import { getOrchestratorReliabilitySummary } from "../src/server/repositories/orchestrator-reliability-repo";

function main() {
  const user = findOrCreateUser();
  const project = resolveProjectById("mission-control");
  const summary = getOrchestratorReliabilitySummary(user.id, project.id);
  const generatedAt = new Date().toISOString();

  const report = {
    generatedAt,
    userId: user.id,
    projectId: project.id,
    counters: {
      create_total: summary.createTotal,
      create_success: summary.createSuccess,
      dispatch_total: summary.dispatchTotal,
      dispatch_success: summary.dispatchSuccess,
      close_total: summary.closeTotal,
      close_success: summary.closeSuccess,
      overlap_block_count: summary.overlapBlockCount,
      stale_cleanup_count: summary.staleCleanupCount,
    },
    rates: {
      create_success_rate: summary.createSuccessRate,
      dispatch_success_rate: summary.dispatchSuccessRate,
      close_success_rate: summary.closeSuccessRate,
    },
  };

  const reportsDir = path.join(process.cwd(), "reports", "ops");
  mkdirSync(reportsDir, { recursive: true });
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const datedPath = path.join(reportsDir, `orchestrator-reliability-${stamp}.json`);
  const latestPath = path.join(reportsDir, "orchestrator-reliability-latest.json");

  const text = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(datedPath, text, "utf8");
  writeFileSync(latestPath, text, "utf8");

  process.stdout.write(`${JSON.stringify({ ok: true, latestPath, datedPath, report }, null, 2)}\n`);
}

main();
