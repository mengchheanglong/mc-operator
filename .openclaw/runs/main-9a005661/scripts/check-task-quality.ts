import { mkdir, writeFile } from "fs/promises";
import path from "path";
import {
  buildTaskQualityPayload,
  createTaskQualityNormalizedError,
  validateTaskQualityPayload,
  type TaskQualityPayload,
} from "../src/server/services/task-quality-guardrails.ts";

type Fixture = {
  name: string;
  source: string;
  expectedOk: boolean;
  payload: TaskQualityPayload;
};

async function main() {
  const fixtures: Fixture[] = [
    {
      name: "agent-dispatch-valid",
      source: "agents.dispatch",
      expectedOk: true,
      payload: buildTaskQualityPayload({
        objective: "Implement task-quality guardrails and fail fast on invalid payloads.",
        scope: "Only update runtime dispatch/execute guardrails and related checks/docs.",
        verificationSteps: ["Run npm run check:task-quality, npm run typecheck, npm run lint, npm run build, npm test."],
        rollbackPlan: ["If regression appears, rollback the guardrail patch and fallback to previous stable validation behavior."],
        outputExpectation: ["Return only bounded output: changed files + command outputs, max 5 summary bullets."],
      }),
    },
    {
      name: "automation-execute-valid",
      source: "automation.templates.execute",
      expectedOk: true,
      payload: buildTaskQualityPayload({
        objective: "Execute automation template with strict preflight validation and telemetry capture.",
        scope: "Limit execution to one template run in the current project; avoid unrelated code paths.",
        verificationSteps: ["Verify dispatch status and run runtime checks before completion."],
        rollbackPlan: ["Fallback to failure report and stop execution if guardrails fail or dispatch errors occur."],
        outputExpectation: ["Provide one bounded execute response only, with at most one dispatch summary."],
      }),
    },
    {
      name: "invalid-missing-rollbacks",
      source: "agents.dispatch",
      expectedOk: false,
      payload: buildTaskQualityPayload({
        objective: "Fix all issues.",
        scope: "Any part of system.",
        verificationSteps: ["Looks okay."],
        rollbackPlan: [],
        outputExpectation: ["Give detailed output."],
      }),
    },
  ];

  const checks = fixtures.map((fixture) => {
    const validation = validateTaskQualityPayload(fixture.payload);
    const normalizedError = validation.ok
      ? null
      : createTaskQualityNormalizedError({ source: fixture.source, issues: validation.issues });
    const expectationMatched = validation.ok === fixture.expectedOk;

    return {
      name: fixture.name,
      source: fixture.source,
      expectedOk: fixture.expectedOk,
      ok: validation.ok,
      expectationMatched,
      issueCount: validation.issues.length,
      issues: validation.issues,
      normalizedError,
    };
  });

  const failed = checks.filter((item) => !item.expectationMatched);
  const output = {
    check: "task-quality",
    timestamp: new Date().toISOString(),
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
  };

  const reportDir = path.resolve(process.cwd(), "reports", "task-quality");
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "latest.json");
  await writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ ...output, artifact: reportPath }, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
