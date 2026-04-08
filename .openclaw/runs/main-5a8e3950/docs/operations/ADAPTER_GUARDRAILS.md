# Adapter Guardrails

Phase 2 introduces a reliability gate for runtime adapters used by Mission Control.

## Covered adapters

- `n8n-execute` (`src/server/services/automation-executor-service.ts`)
- `codegraph-summary` (`src/server/services/codegraph-summary-service.ts`)
- `external-runner` / AO CLI (`src/server/services/agent-orchestrator-service.ts`)

## Guardrails enforced per adapter

1. **Input contract validation** (rejects bad payloads before dispatch)
2. **Output contract validation** (rejects malformed integration responses)
3. **Timeout handling** (bounded per-attempt timeout)
4. **Bounded retries** (finite retries only)
5. **Normalized adapter error**

```json
{
  "code": "string",
  "reason": "string",
  "retryable": true,
  "source": "string",
  "adapter": "string"
}
```

## Contract schema location

- `src/server/adapters/contracts/*.schema.json`

## Reliability gate runtime

- `src/server/adapters/reliability-gate.ts`
- `src/server/adapters/contracts.ts`

## Validation command

Run:

```bash
npm run check:adapters
```

The command returns deterministic JSON and exits non-zero when any contract/behavior check fails.
