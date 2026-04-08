# Directive Workspace Day-2 Verification (2026-03-18)

## Scope
Phase 1 Day 2 from the execution plan:
- verify directive DB/table state
- run candidate seed
- run directive validation gates
- confirm current data population

## Commands Run
1. `npm run directive:seed:candidates`
2. `npm run check:directive-workspace-v0`
3. `npm run check:directive-integration-proof`
4. DB direct read (`better-sqlite3`) against `data/openclaw.db`:
   - counts for `directive_capabilities`, `directive_experiments`, `directive_evaluations`, `directive_decisions`, `directive_integrations`
   - status distribution + 5 most recent capability rows
5. `npm run db:generate` (migration drift check attempt)

## Results
- `directive:seed:candidates`: PASS
  - `ok: true`
  - `totalCatalog: 15`
  - `created: 0`
  - `analyzed: 11`
  - `protected: 4`
- `check:directive-workspace-v0`: PASS
  - `ok: true`
  - status: `integrated`
  - counts: experiments/evaluations/decisions/integrations/registry all present
- `check:directive-integration-proof`: PASS
  - `ok: true`
  - integrated: `4`
  - missingProof: `0`

## DB Evidence (data/openclaw.db)
- `directive_capabilities`: 15
- `directive_experiments`: 4
- `directive_evaluations`: 4
- `directive_decisions`: 4
- `directive_integrations`: 4

Capability statuses:
- `analyzed`: 11
- `integrated`: 4

## Migration Note
`npm run db:generate` is currently interactive in this repo state (rename/create prompts due broad ongoing schema churn). No new migration file was generated during this check. This is not blocking Day-2 directive verification, but migration generation should be re-run in a clean schema review pass.

## Day-2 Verdict
PASS for directive Day-2 verification.

Directive workspace data + checks are healthy and seeded. Next step should move to Phase 1 Day 3: validate/finish intake API behavior with explicit request/response tests.
