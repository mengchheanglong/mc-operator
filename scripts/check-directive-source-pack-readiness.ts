import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getDirectiveForgeSourcePackCatalogPath,
  getAgencyAgentsSourcePackPath,
  getAgentOrchestratorSourcePackPath,
  getDesloppifySourcePackPath,
  resolveAgencyAgentsSourceRoot,
  resolveAgentOrchestratorRoot,
  resolveDesloppifySourceRoot,
} from "@/server/paths/directive-source-packs";

function withWorkspaceRoot<T>(workspaceRoot: string, fn: () => T): T {
  const previous = process.env.OPENCLAW_WORKSPACE_ROOT;
  process.env.OPENCLAW_WORKSPACE_ROOT = workspaceRoot;
  try {
    return fn();
  } finally {
    if (previous == null) {
      delete process.env.OPENCLAW_WORKSPACE_ROOT;
    } else {
      process.env.OPENCLAW_WORKSPACE_ROOT = previous;
    }
  }
}

function createPack(workspaceRoot: string, packName: string, ready = false) {
  const packRoot = path.join(
    workspaceRoot,
    "directive-workspace",
    "forge",
    "source-packs",
    packName,
  );
  mkdirSync(packRoot, { recursive: true });
  writeFileSync(path.join(packRoot, "README.md"), `# ${packName}\n`, "utf8");
  if (ready) {
    writeFileSync(path.join(packRoot, "SOURCE_PACK_READY.md"), `# ${packName} ready\n`, "utf8");
  }
  return packRoot;
}

function writeCatalog(
  workspaceRoot: string,
  packs: Array<{ id: string; classification: "live_runtime" | "follow_up_only" | "reference_only"; activationMode: string }>,
) {
  const catalogPath = path.join(
    workspaceRoot,
    "directive-workspace",
    "forge",
    "source-packs",
    "CATALOG.json",
  );
  const payload = {
    status: "active",
    updatedAt: "2026-03-21",
    policy: {
      readyMarkerMeaning: "cutover_complete",
      runtimeActivationRule:
        "A source pack is runtime-live only when it is classified as live_runtime in this catalog and contains SOURCE_PACK_READY.md.",
      nonLiveRule:
        "follow_up_only and reference_only packs may remain cutover-complete, but they must not be treated as active runtime truth.",
    },
    packs: packs.map((pack) => ({
      id: pack.id,
      label: pack.id,
      classification: pack.classification,
      activationMode: pack.activationMode,
      hostConsumers: [],
      note: "test catalog entry",
    })),
  };
  writeFileSync(catalogPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function expectNotReady(action: () => string) {
  try {
    action();
    return {
      ok: false,
      reason: "expected readiness resolver to throw for pack without SOURCE_PACK_READY.md",
    };
  } catch (error) {
    const message = String((error as Error)?.message || "");
    if (!message.includes("directive_source_pack_not_ready")) {
      return {
        ok: false,
        reason: `unexpected error: ${message || "(empty)"}`,
      };
    }
    return { ok: true, reason: null };
  }
}

function expectInactive(action: () => string) {
  try {
    action();
    return {
      ok: false,
      reason: "expected resolver to throw for pack without live_runtime classification",
    };
  } catch (error) {
    const message = String((error as Error)?.message || "");
    if (!message.includes("directive_source_pack_inactive")) {
      return {
        ok: false,
        reason: `unexpected error: ${message || "(empty)"}`,
      };
    }
    return { ok: true, reason: null };
  }
}

function main() {
  const checks: Array<{ id: string; ok: boolean; reason: string | null }> = [];
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "directive-source-pack-readiness-"));

  try {
    createPack(tempRoot, "agency-agents", false);
    createPack(tempRoot, "desloppify", true);
    createPack(tempRoot, "agent-orchestrator", true);
    writeCatalog(tempRoot, [
      { id: "agency-agents", classification: "live_runtime", activationMode: "resolver" },
      { id: "desloppify", classification: "live_runtime", activationMode: "resolver" },
      { id: "agent-orchestrator", classification: "follow_up_only", activationMode: "manual_follow_up" },
    ]);

    withWorkspaceRoot(tempRoot, () => {
      checks.push({
        id: "catalog-path-available",
        ok: getDirectiveForgeSourcePackCatalogPath().endsWith(path.join("source-packs", "CATALOG.json")),
        reason: null,
      });

      checks.push({
        id: "candidate-paths-available-without-readiness",
        ok:
          getAgencyAgentsSourcePackPath().endsWith(path.join("source-packs", "agency-agents")) &&
          getDesloppifySourcePackPath().endsWith(path.join("source-packs", "desloppify")) &&
          getAgentOrchestratorSourcePackPath().endsWith(
            path.join("source-packs", "agent-orchestrator"),
          ),
        reason: null,
      });

      checks.push({
        id: "agency-agents-runtime-requires-readiness",
        ...expectNotReady(() => resolveAgencyAgentsSourceRoot()),
      });

      checks.push({
        id: "desloppify-runtime-allows-ready-pack",
        ok: resolveDesloppifySourceRoot().endsWith(path.join("source-packs", "desloppify")),
        reason: null,
      });

      checks.push({
        id: "agent-orchestrator-runtime-blocked-when-not-live-runtime",
        ...expectInactive(() => resolveAgentOrchestratorRoot()),
      });
    });

    writeFileSync(
      path.join(
        tempRoot,
        "directive-workspace",
        "forge",
        "source-packs",
        "agency-agents",
        "SOURCE_PACK_READY.md",
      ),
      "# agency-agents ready\n",
      "utf8",
    );
    writeCatalog(tempRoot, [
      { id: "agency-agents", classification: "follow_up_only", activationMode: "manual_follow_up" },
      { id: "desloppify", classification: "live_runtime", activationMode: "resolver" },
      { id: "agent-orchestrator", classification: "follow_up_only", activationMode: "manual_follow_up" },
    ]);

    withWorkspaceRoot(tempRoot, () => {
      checks.push({
        id: "ready-pack-still-blocked-when-not-live-runtime",
        ...expectInactive(() => resolveAgencyAgentsSourceRoot()),
      });
    });

    const realWorkspaceRoot = path.resolve(process.cwd(), "..");
    withWorkspaceRoot(realWorkspaceRoot, () => {
      const liveAgency = resolveAgencyAgentsSourceRoot();
      const liveDesloppify = resolveDesloppifySourceRoot();
      checks.push({
        id: "live-agency-agents-pack-ready",
        ok: liveAgency.endsWith(path.join("source-packs", "agency-agents")),
        reason: null,
      });
      checks.push({
        id: "live-desloppify-pack-ready",
        ok: liveDesloppify.endsWith(path.join("source-packs", "desloppify")),
        reason: null,
      });
      checks.push({
        id: "live-agent-orchestrator-pack-blocked",
        ...expectInactive(() => resolveAgentOrchestratorRoot()),
      });
    });
  } finally {
    try {
      rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
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
  assert.equal(failed.length, 0);
}

main();
