import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const rulesPath = path.join(root, ".openclaw", "lessons", "workflow-rules.json");
const reportPath = path.join(root, "reports", "lessons", "latest.json");
const injectionPath = path.join(root, "reports", "lessons", "injection-latest.json");

assert.ok(existsSync(rulesPath), "Missing lesson catalog (.openclaw/lessons/workflow-rules.json). Run npm run lessons:update");
assert.ok(existsSync(reportPath), "Missing reports/lessons/latest.json");
assert.ok(existsSync(injectionPath), "Missing reports/lessons/injection-latest.json");

const catalog = JSON.parse(readFileSync(rulesPath, "utf8")) as {
  promotionThreshold?: number;
  items?: Array<{
    id?: string;
    status?: string;
    count?: number;
    prevention?: string;
    verification?: string;
  }>;
};
assert.ok(Array.isArray(catalog.items), "Catalog items must be an array");
assert.ok(Number(catalog.promotionThreshold || 0) >= 2, "promotionThreshold must be >= 2");

for (const item of catalog.items || []) {
  assert.ok(item.id, "Each lesson rule must include id");
  assert.ok(item.status === "candidate" || item.status === "active" || item.status === "deprecated", "Invalid lesson status");
  assert.ok(Number(item.count || 0) >= 1, "Lesson count must be >= 1");
  assert.ok(String(item.prevention || "").length <= 180, "Prevention text exceeds bound");
  assert.ok(String(item.verification || "").length <= 180, "Verification text exceeds bound");
  if (item.status === "active") {
    assert.ok(Number(item.count || 0) >= Number(catalog.promotionThreshold || 2), "Active rule below promotion threshold");
  }
}

const injection = JSON.parse(readFileSync(injectionPath, "utf8")) as {
  latest?: Array<{ charsInjected?: number; budgetChars?: number }>;
};
for (const row of injection.latest || []) {
  const chars = Number(row.charsInjected || 0);
  const budget = Number(row.budgetChars || 0);
  assert.ok(budget > 0, "Telemetry budgetChars must be > 0");
  assert.ok(chars <= budget, `Budget violation: charsInjected=${chars} budgetChars=${budget}`);
}

console.log(`lessons check: PASS (items=${(catalog.items || []).length}, telemetryRows=${(injection.latest || []).length})`);
