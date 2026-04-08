import fs from "node:fs";
import path from "node:path";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

function readIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function includesAll(content: string, required: string[]) {
  const missing = required.filter((term) => !content.includes(term));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function main() {
  const workspaceRoot = process.cwd();
  const directiveRoot = path.resolve(workspaceRoot, "..", "directive-workspace");

  const contractPath = path.join(directiveRoot, "shared", "contracts", "ao-host-adapter-scope.md");
  const decisionPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-agent-orchestrator-host-adapter-decision.md",
  );
  const followUpPath = path.join(
    directiveRoot,
    "forge",
    "follow-up",
    "2026-03-20-agent-orchestrator-runtime-followup.md",
  );
  const latestCatalogPath = path.join(directiveRoot, "forge", "source-packs", "CATALOG.json");
  const uiPath = path.join(workspaceRoot, "src", "app", "dashboard", "agents", "AgentsPageClient.tsx");
  const catalogServicePath = path.join(
    workspaceRoot,
    "backend",
    "src",
    "modules",
    "agents-catalog",
    "agents-catalog.service.ts",
  );
  const dispatchServicePath = path.join(
    workspaceRoot,
    "backend",
    "src",
    "modules",
    "agents-dispatch",
    "agents-dispatch.service.ts",
  );
  const runtimeServicePath = path.join(
    workspaceRoot,
    "backend",
    "src",
    "modules",
    "agents-runtime",
    "agents-runtime.service.ts",
  );
  const extrasServicePath = path.join(
    workspaceRoot,
    "backend",
    "src",
    "modules",
    "agents-extras",
    "agents-extras.service.ts",
  );
  const promotionPath = path.join(
    directiveRoot,
    "forge",
    "promotion-records",
    "2026-03-21-agent-orchestrator-promotion-record.md",
  );
  const registryPath = path.join(
    directiveRoot,
    "forge",
    "registry",
    "2026-03-21-agent-orchestrator-registry-entry.md",
  );

  const checks: Check[] = [];

  const contract = readIfExists(contractPath);
  const decision = readIfExists(decisionPath);
  const followUp = readIfExists(followUpPath);
  const latestCatalog = readIfExists(latestCatalogPath);
  const ui = readIfExists(uiPath);
  const catalogService = readIfExists(catalogServicePath);
  const dispatchService = readIfExists(dispatchServicePath);
  const runtimeService = readIfExists(runtimeServicePath);
  const extrasService = readIfExists(extrasServicePath);

  checks.push({
    id: "ao-host-scope-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "ao-host-scope-decision-exists",
    ok: Boolean(decision),
    reason: decision ? null : `missing decision record: ${decisionPath}`,
  });
  checks.push({
    id: "ao-follow-up-exists",
    ok: Boolean(followUp),
    reason: followUp ? null : `missing follow-up: ${followUpPath}`,
  });
  checks.push({
    id: "ao-no-promotion-record",
    ok: !fs.existsSync(promotionPath),
    reason: fs.existsSync(promotionPath) ? `unexpected promotion record: ${promotionPath}` : null,
  });
  checks.push({
    id: "ao-no-registry-entry",
    ok: !fs.existsSync(registryPath),
    reason: fs.existsSync(registryPath) ? `unexpected registry entry: ${registryPath}` : null,
  });

  if (contract) {
    const required = includesAll(contract, [
      "ao_host_adapter_scope/v1",
      "`follow_up_only`",
      "block new agent creation or update to `backend = agent-orchestrator`",
      "block interactive AO runtime endpoints",
      "block AO dispatch/session controls in the host UI",
    ]);
    checks.push({
      id: "ao-host-scope-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (decision) {
    const required = includesAll(decision, [
      "Decision result: `keep_follow_up_only`",
      "CLI precondition proof",
      "bounded `ao status --json` smoke",
      "UI downgrade from active AO backend to follow-up-only messaging",
    ]);
    checks.push({
      id: "ao-host-scope-decision-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing decision terms: ${required.missing.join(", ")}`,
    });
  }

  if (followUp) {
    const required = includesAll(followUp, [
      "host-adapter decision is now closed",
      "the pack remains `follow_up_only`",
      "If AO is reopened, open only one bounded promotion slice",
    ]);
    checks.push({
      id: "ao-follow-up-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing follow-up terms: ${required.missing.join(", ")}`,
    });
  }

  if (latestCatalog) {
    const required = includesAll(latestCatalog, [
      "\"id\": \"agent-orchestrator\"",
      "\"classification\": \"follow_up_only\"",
      "\"activationMode\": \"manual_follow_up\"",
      "\"hostConsumers\": []",
    ]);
    checks.push({
      id: "ao-catalog-follow-up-only",
      ok: required.ok,
      reason: required.ok ? null : `catalog drift: ${required.missing.join(", ")}`,
    });
  }

  if (ui) {
    const required = includesAll(ui, [
      "agent-orchestrator (follow-up only)",
      "draft.backend !== \"agent-orchestrator\"",
      "AO Follow-up Only",
      "AO Host Adapter Blocked",
    ]);
    checks.push({
      id: "ao-ui-follow-up-only",
      ok: required.ok,
      reason: required.ok ? null : `UI drift: ${required.missing.join(", ")}`,
    });
  }

  if (catalogService) {
    const required = includesAll(catalogService, [
      "backend_follow_up_only",
      "agent-orchestrator remains follow-up only and cannot be selected as a live agent backend.",
    ]);
    checks.push({
      id: "ao-catalog-service-guard",
      ok: required.ok,
      reason: required.ok ? null : `catalog service drift: ${required.missing.join(", ")}`,
    });
  }

  if (dispatchService) {
    const required = includesAll(dispatchService, [
      "backend_follow_up_only",
      "agent-orchestrator remains follow-up only; dispatch through the live host surface is blocked.",
    ]);
    checks.push({
      id: "ao-dispatch-service-guard",
      ok: required.ok,
      reason: required.ok ? null : `dispatch service drift: ${required.missing.join(", ")}`,
    });
  }

  if (runtimeService) {
    const required = includesAll(runtimeService, [
      "backend_follow_up_only",
      "agent-orchestrator remains follow-up only; interactive host runtime endpoints are blocked.",
    ]);
    checks.push({
      id: "ao-runtime-service-guard",
      ok: required.ok,
      reason: required.ok ? null : `runtime service drift: ${required.missing.join(", ")}`,
    });
  }

  if (extrasService) {
    const required = includesAll(extrasService, [
      "backend_follow_up_only",
      "agent-orchestrator remains follow-up only; interactive host send is blocked.",
    ]);
    checks.push({
      id: "ao-extras-service-guard",
      ok: required.ok,
      reason: required.ok ? null : `extras service drift: ${required.missing.join(", ")}`,
    });
  }

  const failed = checks.filter((check) => !check.ok);
  const output = {
    ok: failed.length === 0,
    metrics: {
      totalChecks: checks.length,
      failedChecks: failed.length,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failed.length > 0) process.exit(1);
}

main();
