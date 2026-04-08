import assert from "assert";
import { readFileSync } from "fs";
import { buildExecutionPacket, dedupeContextBlocks, validateQuestStatusTransition } from "../src/lib/workflow/mission-control-workflow.ts";

const deduped = dedupeContextBlocks([
  { label: "A", content: "same" },
  { label: "a", content: "same" },
  { label: "B", content: "different" },
]);
assert.equal(deduped.length, 2, "dedupe should remove identical context blocks");

const packet = buildExecutionPacket({
  objective: "Implement concise feature with verification",
  constraints: ["small scope"],
  executionNotes: ["do it"],
  verification: ["run checks"],
  reportFormat: ["files, outputs"],
  contextBlocks: Array.from({ length: 20 }).map((_, i) => ({ label: `ctx-${i}`, content: `block ${i}`.repeat(200) })),
});

assert.ok(packet.boundedContext.blocksUsed <= packet.boundedContext.maxBlocks, "bounded block count should be enforced");
assert.ok(packet.costRisk.tier === "low" || packet.costRisk.tier === "medium" || packet.costRisk.tier === "high");
assert.equal(validateQuestStatusTransition("done", "blocked"), false, "done -> blocked should be invalid");
assert.equal(validateQuestStatusTransition("blocked", "in_progress"), true, "blocked -> in_progress should be valid");

const guardsRepo = readFileSync(new URL("../src/server/repositories/workflow-run-guards-repo.ts", import.meta.url), "utf8");
assert.match(guardsRepo, /workflowRunGuards|workflow_run_guards/i, "workflow guards should persist to database-backed table");

const automationsUi = readFileSync(new URL("../src/app/dashboard/automations/AutomationsPageClient.tsx", import.meta.url), "utf8");
assert.match(automationsUi, /\/api\/workflow\/guards/, "Automations UI should fetch workflow guards");
assert.match(automationsUi, /re-analysis/, "Automations UI should surface re-analysis badge");
assert.match(automationsUi, /lastCostRiskLabel/, "Automations UI should surface cost-risk badge");

const questRoute = readFileSync(new URL("../src/app/api/quests/[id]/route.ts", import.meta.url), "utf8");
const questCompleteRoute = readFileSync(new URL("../src/app/api/quests/[id]/complete/route.ts", import.meta.url), "utf8");
assert.match(questRoute, /validateVerificationEvidence/, "Quest update route should validate verification evidence");
assert.match(questCompleteRoute, /validateVerificationEvidence/, "Quest complete route should validate verification evidence");

console.log("workflow guardrails check: PASS");
