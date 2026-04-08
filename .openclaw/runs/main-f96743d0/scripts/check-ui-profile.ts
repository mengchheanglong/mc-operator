import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AGENT_PROFILE_DEFINITIONS,
  buildAgentProfileDispatchDirectives,
  normalizeAgentProfileId,
} from "../src/lib/agents/agent-profiles.ts";
import { buildExecutionPacket } from "../src/lib/workflow/mission-control-workflow.ts";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

function runCheck(name: string, condition: boolean, detail: string): CheckResult {
  return { name, ok: condition, detail };
}

function buildPacket(profileId: "default" | "impeccable-ui") {
  const directives = buildAgentProfileDispatchDirectives(profileId);
  return buildExecutionPacket({
    objective: "Tune one dashboard panel interaction.",
    constraints: [
      "Follow mission-control workflow: objective -> constraints -> execution -> verification -> report.",
      ...directives.constraints,
    ],
    executionNotes: ["Prefer small reversible edits.", ...directives.executionNotes],
    verification: ["Run touched checks.", ...directives.verification],
    reportFormat: [...directives.reportFormat, "Changed files", "Verification outputs", "Risks", "Next step"],
    contextBlocks: directives.contextBlocks,
    deepMode: false,
  });
}

async function main() {
  const defaultProfile = AGENT_PROFILE_DEFINITIONS.find((profile) => profile.id === "default");
  const uiProfile = AGENT_PROFILE_DEFINITIONS.find((profile) => profile.id === "impeccable-ui");
  const defaultDirectives = buildAgentProfileDispatchDirectives("default");
  const uiDirectives = buildAgentProfileDispatchDirectives("impeccable-ui");
  const baselinePacket = buildExecutionPacket({
    objective: "Tune one dashboard panel interaction.",
    constraints: ["Follow mission-control workflow: objective -> constraints -> execution -> verification -> report."],
    executionNotes: ["Prefer small reversible edits."],
    verification: ["Run touched checks."],
    reportFormat: ["Changed files", "Verification outputs", "Risks", "Next step"],
    deepMode: false,
  });
  const defaultPacket = buildPacket("default");
  const uiPacket = buildPacket("impeccable-ui");

  const checks: CheckResult[] = [
    runCheck("profile-default-registered", Boolean(defaultProfile), "default profile exists in registry"),
    runCheck("profile-impeccable-ui-registered", Boolean(uiProfile), "impeccable-ui profile exists in registry"),
    runCheck("profile-impeccable-ui-opt-in", uiProfile?.nonDefault === true, "impeccable-ui is marked non-default"),
    runCheck("normalize-unknown-falls-back-default", normalizeAgentProfileId("x-anything") === "default", "unknown IDs normalize to default"),
    runCheck(
      "default-directives-empty",
      defaultDirectives.constraints.length === 0
        && defaultDirectives.executionNotes.length === 0
        && defaultDirectives.verification.length === 0
        && defaultDirectives.reportFormat.length === 0
        && defaultDirectives.contextBlocks.length === 0,
      "default profile injects no additional directives",
    ),
    runCheck(
      "default-isolation-brief-unchanged",
      defaultPacket.brief === baselinePacket.brief,
      "default profile yields identical brief output to baseline",
    ),
    runCheck(
      "impeccable-ui-has-ux-summary",
      uiDirectives.reportFormat.includes("UX issue summary") && uiPacket.brief.includes("UX issue summary"),
      "impeccable-ui brief carries UX issue summary requirement",
    ),
    runCheck(
      "impeccable-ui-has-concrete-plan",
      uiDirectives.reportFormat.includes("Concrete change plan") && uiPacket.brief.includes("Concrete change plan"),
      "impeccable-ui brief carries concrete change plan requirement",
    ),
    runCheck(
      "impeccable-ui-has-verification-checklist",
      uiPacket.brief.includes("responsive")
        && uiPacket.brief.includes("accessibility")
        && uiPacket.brief.includes("visual regressions"),
      "impeccable-ui brief requires responsive/accessibility/visual regression verification",
    ),
    runCheck(
      "isolation-default-does-not-include-ui-structure",
      !defaultPacket.brief.includes("UX issue summary")
        && !defaultPacket.brief.includes("Concrete change plan")
        && !defaultPacket.brief.includes("visual regressions"),
      "default profile does not include UI profile-only structure",
    ),
  ];

  const failed = checks.filter((item) => !item.ok);
  const output = {
    check: "ui-profile",
    timestamp: new Date().toISOString(),
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
  };

  const reportDir = path.resolve(process.cwd(), "reports", "ui-profile");
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "latest.json");
  await writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ ...output, artifact: reportPath }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

void main();
