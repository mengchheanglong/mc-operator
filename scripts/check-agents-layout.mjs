import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const filePath = new URL("../src/app/dashboard/agents/AgentsPageClient.tsx", import.meta.url);
const source = readFileSync(filePath, "utf8");

assert.match(source, /min-h-\[12rem\] max-h-\[18rem\] overflow-y-auto/, "Agent list panel should be compact + scrollable");
assert.match(source, /flex min-h-\[24rem\] flex-1 flex-col gap-4 overflow-y-auto/, "Runtime/task region should be lower flexible panel");
assert.doesNotMatch(source, /Create Agent/i, "Primary Create Agent flow should not appear in Agents page client");
assert.match(source, /Latest Run Timeline/, "Agents page should render an inline latest run timeline label");
assert.match(source, /Backend:/, "Latest run timeline should surface backend details");
assert.match(source, /Session ID:/, "Latest run timeline should surface session id details");
assert.match(source, /Run status:/, "Latest run timeline should surface run status details");
assert.match(source, /Chain\/handoff results:/, "Latest run timeline should surface chain/handoff results");

console.log("Agents layout + timeline checks passed.");
