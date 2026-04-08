# Directive Workspace Day-3 Intake API Verification (2026-03-18)

## Scope
Phase 1 Day 3:
- verify capability intake API functionality
- ensure route-level create/list behavior is testable in isolation

## Changes
1. Added script: `scripts/check-directive-intake-api.ts`
   - calls `POST /api/directive-workspace/capabilities` route handler
   - validates `201` response, `ok: true`, and persisted `sourceRef`
   - calls `GET /api/directive-workspace/capabilities?status=intake`
   - validates created capability appears with status `intake`
   - runs against isolated temp SQLite DB via `SQLITE_PATH`
2. Added npm script:
   - `check:directive-intake-api` in `package.json`

## Commands Run
1. `npm run check:directive-intake-api`
2. `npm run check:directive-workspace-v0`
3. `npm run check:directive-integration-proof`

## Results
- `check:directive-intake-api`: PASS
  - `ok: true`
  - status: `intake`
  - route-level create + list path verified
- `check:directive-workspace-v0`: PASS
- `check:directive-integration-proof`: PASS

## Verdict
Day-3 intake API verification is complete and passing.

Next planned step: Phase 1 Day 4 (analysis + experiment API verification with explicit request/response checks).
