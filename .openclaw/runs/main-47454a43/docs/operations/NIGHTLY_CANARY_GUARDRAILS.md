# Nightly Canary Guardrails

## Commands

- `npm run canary:nightly`
- `npm run check:canary-health`

## What nightly canary executes

`canary:nightly` runs four critical checks in order:

1. `npm run check:agent-evals`
2. `npm run check:adapters`
3. `npm run check:ui-smoke`
4. `npm run check:reliability`

The canary always writes deterministic JSON with per-check pass/fail status:

- `reports/ops/canary-latest.json`
- `reports/ops/canary-<timestamp>.json`

It exits non-zero when any critical check fails.

## Failure follow-up (Quest dedupe + cooldown)

On failure, the canary computes:

- **failure class**: sorted list of failing check ids
- **window key**: floored timestamp bucket (configurable)
- **dedupe key**: `nightly-canary:<hash(window+failureClass)>`

Guardrails:

- One open canary Quest per dedupe key/window.
- Existing matching Quest is reused (updated, not duplicated).
- Re-alert reports are suppressed during cooldown for the same failure class.

Config:

- `MISSION_CONTROL_CANARY_WINDOW_MINUTES` (default `360`)
- `MISSION_CONTROL_CANARY_COOLDOWN_MINUTES` (default `180`)

On failure, report payload stays compact and includes:

- failing checks
- exact failing command(s)
- clear next-step commands

## Success behavior

On success, no Quest is created. A concise success report entry is added to daily reports via the report sync pipeline.

## Health check

`check:canary-health` validates `reports/ops/canary-latest.json`:

- exists and parseable
- not stale (default max age 30h)
- no failed critical checks

Config:

- `MISSION_CONTROL_CANARY_MAX_AGE_HOURS` (default `30`)
