import { evaluateAgentEvalRegression } from "../src/server/services/agent-eval-guard-service.ts";

async function main() {
  const result = await evaluateAgentEvalRegression();

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

void main();
