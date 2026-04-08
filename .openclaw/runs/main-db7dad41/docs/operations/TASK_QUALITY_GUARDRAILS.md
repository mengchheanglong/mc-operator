# Task Quality Guardrails

## Purpose

Task quality guardrails block low-quality agent/automation task payloads before runtime dispatch.

## Enforced rules

Every task payload must include:

1. **Clear objective/scope**
   - Objective must be explicit and non-trivial.
   - Scope must define bounded execution context.
2. **Verification steps**
   - At least one actionable validation step.
3. **Rollback/fallback plan**
   - At least one actionable recovery path (rollback/revert/fallback/stop/escalate).
4. **Bounded output expectation**
   - Output must have explicit bounds (for example `max`, `at most`, `only`, `no more than`).

## Runtime preflight integration

Guardrails run before runtime preflight in:

- `POST /api/agents/[id]/dispatch`
- `POST /api/automation/templates/[id]/execute`

Invalid payloads return **422** with normalized actionable error:

- `code: task_quality_validation_failed`
- `error`: normalized error object (`code`, `reason`, `retryable`, `source`, `adapter`)
- `issues`: field-level failures with remediation actions

## Strict check command

```bash
npm run check:task-quality
```

Behavior:

- exits `0` when all expected task-quality checks match
- exits non-zero when checks fail expectations
- writes machine-readable artifact to:
  - `reports/task-quality/latest.json`
