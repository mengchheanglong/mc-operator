import { execSync } from "node:child_process";

type CheckResult = {
  command: string;
  ok: boolean;
  error?: string;
};

const OPS_STACK_CHECKS = [
  "npm run check:backend-api-suite",
  "npm run check:core-api-contracts",
  "npm run check:directive-v0",
  "npm run check:directive-forge-boundary-inventory",
  "npm run check:directive-forge-sync",
  "npm run check:directive-forge-records",
  "npm run check:directive-integration-proof",
  "npm run check:directive-workspace-health",
  "npm run check:directive-workspace-report-sync",
  "npm run check:directive-workflow-doctrine",
  "npm run check:directive-engine",
  "npm run check:directive-mission-control-engine-runs",
  "npm run check:directive-standalone-surface",
  "npm run check:directive-standalone-host",
  "npm run check:directive-standalone-bootstrap",
  "npm run check:directive-standalone-api-host",
  "npm run check:directive-standalone-api-auth",
  "npm run check:directive-standalone-runtime-profile",
  "npm run check:directive-standalone-sqlite-persistence",
  "npm run check:directive-standalone-forge-host",
  "npm run check:directive-frontend-host-compat",
  "npm run check:directive-host-integration-boundary",
  "npm run check:directive-host-integration-kit",
  "npm run check:directive-shared-lib-sync",
  "npm run check:directive-holding-contracts",
  "npm run check:directive-architecture-contracts",
  "npm run check:directive-architecture-source-storage",
  "npm run check:directive-architecture-handoff-start",
  "npm run check:directive-openmoss-contracts",
  "npm run check:directive-metaclaw-contracts",
  "npm run check:directive-codegraphcontext-contracts",
  "npm run check:directive-hermes-contracts",
  "npm run check:directive-impeccable-contracts",
  "npm run check:directive-celtrix-contracts",
  "npm run check:directive-orchestration-allowlist-contracts",
  "npm run check:directive-source-pack-catalog",
  "npm run check:directive-source-pack-hygiene",
  "npm run check:directive-source-pack-readiness",
  "npm run check:directive-live-runtime-accounting",
  "npm run check:directive-import-source-policy",
  "npm run check:directive-promotion-profile-catalog",
  "npm run check:directive-design-philosophy-forge",
  "npm run check:directive-superpowers-forge",
  "npm run check:directive-promptfoo-forge",
  "npm run check:directive-puppeteer-forge",
  "npm run check:directive-arscontexta-forge",
  "npm run check:directive-skills-manager-forge",
  "npm run check:directive-cli-anything-reentry",
  "npm run check:directive-agent-orchestrator-preconditions",
  "npm run check:directive-agent-orchestrator-cli-smoke",
  "npm run check:directive-agent-orchestrator-host-scope",
  "npm run check:directive-discovery-submission-api",
  "npm run check:discovery-intake-queue",
  "npm run check:discovery-front-door-coverage",
  "npm run check:discovery-intake-transition",
  "npm run check:discovery-intake-lifecycle-sync",
  "npm run check:discovery-routing-record-writer",
  "npm run check:discovery-completion-record-writer",
  "npm run check:discovery-case-record-writer",
  "npm run check:discovery-submission-router",
  "npm run check:discovery-mission-routing",
  "npm run check:discovery-gap-worklist",
  "npm run check:openclaw-discovery-submission",
  "npm run check:openclaw-runtime-verification-signal",
  "npm run check:openclaw-maintenance-watchdog-signal",
  "npm run check:directive-gh-aw-contracts",
  "npm run check:directive-architecture-schemas",
  "npm run check:directive-artifact-contracts",
  "npm run check:directive-lifecycle-artifacts",
  "npm run check:directive-promotion-quality-contracts",
  "npm run check:directive-structured-output-fallback",
  "npm run check:directive-citation-contracts",
  "npm run check:directive-integration-artifact-templates",
  "npm run check:agent-evals",
  "npm run check:agent-eval-regression",
  "npm run check:repo-sources-health",
  "npm run check:workspace-health-nightly",
  "npm run check:canary-health",
  "npm run check:nightly-ops",
  "npm run check:nightly-trend-health",
  "npm run check:nightly-step-hotspots",
  "npm run check:nightly-hotspot-report-health",
  "npm run check:nightly-hotspot-summary-health",
  "npm run check:nightly-hotspot-alert-feed-health",
  "npm run check:nightly-hotspot-followup-health",
  "npm run check:nightly-summary-health",
  "npm run check:nightly-repeat-failures",
  "npm run check:ops-health",
];

function runCheck(command: string): CheckResult {
  try {
    execSync(command, { stdio: "pipe", encoding: "utf8" });
    return { command, ok: true };
  } catch (error) {
    const message = String((error as Error & { stderr?: string }).message || "");
    return {
      command,
      ok: false,
      error: message.slice(0, 2000),
    };
  }
}

function main() {
  const checks = OPS_STACK_CHECKS.map(runCheck);
  const ok = checks.every((item) => item.ok);
  const output = {
    ok,
    checks,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main();
