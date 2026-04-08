import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTIVE_WORKSPACE_V0,
  inferDirectiveCapabilityTitle,
  normalizeDirectiveDecision,
  normalizeDirectiveRecommendation,
  normalizeDirectiveSourceType,
  parseDirectiveIntegrationProof,
} from "../../src/lib/directive-workspace/v0.ts";

test("directive workspace v0 models source adaptation intake instead of repo-only intake", () => {
  assert.deepEqual(DIRECTIVE_WORKSPACE_V0.supportedSourceTypes, [
    "github-repo",
    "paper",
    "product-doc",
    "theory",
    "technical-essay",
    "workflow-writeup",
    "external-system",
    "internal-signal",
  ]);
  assert.equal(DIRECTIVE_WORKSPACE_V0.workflowFamily, "source-adaptation-engine");
  assert.equal(normalizeDirectiveSourceType("github-repo"), "github-repo");
  assert.equal(normalizeDirectiveSourceType("paper"), "paper");
  assert.equal(normalizeDirectiveSourceType("internal-signal"), "internal-signal");
  assert.throws(
    () => normalizeDirectiveSourceType("podcast"),
    /supported source types/,
  );
});

test("directive workspace v0 keeps explicit recommendation and decision enums", () => {
  assert.equal(normalizeDirectiveRecommendation("test"), "test");
  assert.equal(normalizeDirectiveDecision("adopt"), "adopt");
  assert.throws(() => normalizeDirectiveRecommendation("adopt"), /unsupported recommendation/);
});

test("inferDirectiveCapabilityTitle strips repo suffixes", () => {
  assert.equal(
    inferDirectiveCapabilityTitle("https://github.com/example/agent-pack.git"),
    "agent-pack",
  );
  assert.equal(
    inferDirectiveCapabilityTitle("C:/workspace/directive-workspace/forge/source-packs/agency-agents"),
    "agency-agents",
  );
});

test("parseDirectiveIntegrationProof validates required execution and artifact fields", () => {
  const valid = parseDirectiveIntegrationProof({
    execution: {
      ok: true,
      method: "dashboard-proof",
      reference: "directive/smoke",
      timestamp: "2026-03-17T15:00:00.000Z",
    },
    artifact: {
      reportId: "rpt-1",
      reportHref: "/dashboard/report?day=2026-03-17",
      artifactPath: "reports/ops/proof.md",
      summary: "proof",
    },
  });
  assert.ok(valid);

  const invalid = parseDirectiveIntegrationProof({
    execution: { ok: false, method: "", reference: "", timestamp: "bad" },
    artifact: { reportId: null, reportHref: null, artifactPath: null },
  });
  assert.equal(invalid, null);
});
