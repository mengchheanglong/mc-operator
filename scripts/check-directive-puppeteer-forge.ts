import fs from "node:fs";
import path from "node:path";
import {
  getForgePromotionProfile,
  resolveDirectiveWorkspacePath,
} from "./directive-promotion-profile-lib";
import {
  getForgeSourcePackCatalogEntry,
  getForgeSourcePackPath,
} from "@/server/paths/directive-source-packs";

type Check = {
  id: string;
  ok: boolean;
  reason: string | null;
};

type UiSmokeReport = {
  suite?: string;
  ok?: boolean;
  generatedAt?: string;
  baseUrl?: string;
  flows?: Array<{
    id?: string;
    status?: string;
    screenshot?: string;
    issues?: Array<unknown>;
    error?: string | null;
  }>;
  totals?: {
    passed?: number;
    failed?: number;
  };
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
  const profile = getForgePromotionProfile("browser_smoke_guard/v1");

  const forgeRecordPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-puppeteer-forge-record.md",
  );
  const proofPath = path.join(
    directiveRoot,
    "forge",
    "records",
    "2026-03-21-puppeteer-runtime-slice-01-proof.md",
  );
  const promotionPath = path.join(
    directiveRoot,
    "forge",
    "promotion-records",
    "2026-03-21-puppeteer-promotion-record.md",
  );
  const registryPath = path.join(
    directiveRoot,
    "forge",
    "registry",
    "2026-03-21-puppeteer-registry-entry.md",
  );
  const contractPath = resolveDirectiveWorkspacePath(profile.contractPath);
  const latestSmokePath = path.join(
    workspaceRoot,
    "reports",
    "ui-smoke",
    "latest.json",
  );
  const packRoot = getForgeSourcePackPath("puppeteer");
  const packReadyPath = path.join(packRoot, "SOURCE_PACK_READY.md");
  const sourcePackEntry = getForgeSourcePackCatalogEntry("puppeteer");

  const checks: Check[] = [];

  const forgeRecord = readIfExists(forgeRecordPath);
  const proof = readIfExists(proofPath);
  const promotion = readIfExists(promotionPath);
  const registry = readIfExists(registryPath);
  const contract = readIfExists(contractPath);
  const latestSmoke = readIfExists(latestSmokePath);

  checks.push({
    id: "puppeteer-forge-record-exists",
    ok: Boolean(forgeRecord),
    reason: forgeRecord ? null : `missing forge record: ${forgeRecordPath}`,
  });
  checks.push({
    id: "puppeteer-proof-exists",
    ok: Boolean(proof),
    reason: proof ? null : `missing proof: ${proofPath}`,
  });
  checks.push({
    id: "puppeteer-promotion-exists",
    ok: Boolean(promotion),
    reason: promotion ? null : `missing promotion record: ${promotionPath}`,
  });
  checks.push({
    id: "puppeteer-registry-exists",
    ok: Boolean(registry),
    reason: registry ? null : `missing registry entry: ${registryPath}`,
  });
  checks.push({
    id: "puppeteer-contract-exists",
    ok: Boolean(contract),
    reason: contract ? null : `missing contract: ${contractPath}`,
  });
  checks.push({
    id: "puppeteer-latest-smoke-exists",
    ok: Boolean(latestSmoke),
    reason: latestSmoke ? null : `missing latest smoke artifact: ${latestSmokePath}`,
  });
  checks.push({
    id: "puppeteer-source-pack-ready",
    ok: fs.existsSync(packReadyPath),
    reason: fs.existsSync(packReadyPath) ? null : `missing ready marker: ${packReadyPath}`,
  });
  checks.push({
    id: "puppeteer-source-pack-live-runtime",
    ok:
      sourcePackEntry?.classification === "live_runtime" &&
      sourcePackEntry.activationMode === "bounded_browser_lane",
    reason:
      sourcePackEntry?.classification === "live_runtime" &&
      sourcePackEntry.activationMode === "bounded_browser_lane"
        ? null
        : `unexpected source-pack classification: ${JSON.stringify(sourcePackEntry)}`,
  });

  if (contract) {
    const required = includesAll(contract, [
      profile.id,
      profile.family,
      profile.proofShape,
      profile.primaryHostCheckCommand,
      "smoke report `ok` must be `true`",
      "failed flows must equal `0`",
      "every flow must record a screenshot path",
      "`npm run check:directive-puppeteer-forge`",
    ]);
    checks.push({
      id: "puppeteer-contract-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing contract terms: ${required.missing.join(", ")}`,
    });
  }

  if (forgeRecord) {
    const required = includesAll(forgeRecord, [
      "bounded browser smoke lane",
      "npm run ui:smoke",
      "npm run check:ui-smoke",
      "npm run check:directive-puppeteer-forge",
      "npm run check:ops-stack",
    ]);
    checks.push({
      id: "puppeteer-forge-record-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing forge-record terms: ${required.missing.join(", ")}`,
    });
  }

  if (proof) {
    const required = includesAll(proof, [
      `Quality gate profile: ${profile.id}`,
      `Promotion profile family: ${profile.family}`,
      `Proof shape: ${profile.proofShape}`,
      `Primary host checker: \`${profile.primaryHostCheckCommand}\``,
      "passed flows: `3`",
      "failed flows: `0`",
      "`npm run ui:smoke` -> PASS",
      "`npm run check:ui-smoke` -> PASS",
      `\`${profile.primaryHostCheckCommand}\` -> PASS`,
    ]);
    checks.push({
      id: "puppeteer-proof-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing proof terms: ${required.missing.join(", ")}`,
    });
  }

  if (promotion) {
    const required = includesAll(promotion, [
      profile.id,
      profile.family,
      profile.proofShape,
      profile.primaryHostCheckCommand,
      "callable (bounded-browser-lane)",
      "check:ui-smoke",
      "check:directive-puppeteer-forge",
    ]);
    checks.push({
      id: "puppeteer-promotion-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing promotion terms: ${required.missing.join(", ")}`,
    });
  }

  if (registry) {
    const required = includesAll(registry, [
      "callable (bounded-browser-lane)",
      "check:ops-stack",
    ]);
    checks.push({
      id: "puppeteer-registry-required-terms",
      ok: required.ok,
      reason: required.ok ? null : `missing registry terms: ${required.missing.join(", ")}`,
    });
  }

  if (latestSmoke) {
    const parsed = JSON.parse(latestSmoke) as UiSmokeReport;
    const flows = Array.isArray(parsed.flows) ? parsed.flows : [];
    const expectedFlowIds = ["agents", "automations", "report"];
    const missingFlows = expectedFlowIds.filter(
      (id) => !flows.some((flow) => flow.id === id && flow.status === "pass"),
    );
    const screenshotMissing = flows.some((flow) => {
      if (!flow.screenshot) return true;
      const screenshotPath = path.resolve(workspaceRoot, flow.screenshot);
      return !fs.existsSync(screenshotPath);
    });
    const issueLeaks = flows.some((flow) => Array.isArray(flow.issues) && flow.issues.length > 0);

    checks.push({
      id: "puppeteer-latest-smoke-thresholds",
      ok:
        parsed.suite === "ui-smoke" &&
        parsed.ok === true &&
        Number(parsed.totals?.failed ?? 1) === 0 &&
        Number(parsed.totals?.passed ?? 0) >= expectedFlowIds.length &&
        missingFlows.length === 0 &&
        !screenshotMissing &&
        !issueLeaks,
      reason:
        parsed.suite === "ui-smoke" &&
        parsed.ok === true &&
        Number(parsed.totals?.failed ?? 1) === 0 &&
        Number(parsed.totals?.passed ?? 0) >= expectedFlowIds.length &&
        missingFlows.length === 0 &&
        !screenshotMissing &&
        !issueLeaks
          ? null
          : `latest smoke invalid: suite=${parsed.suite} ok=${parsed.ok} failed=${parsed.totals?.failed} missingFlows=${missingFlows.join(",")} screenshotMissing=${screenshotMissing} issueLeaks=${issueLeaks}`,
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
