# UI Smoke Guardrails

Deterministic smoke verification for critical dashboard workflows.

## Commands

- `npm run ui:smoke`
  - Boots Next dev server on `127.0.0.1:3210` (override with `UI_SMOKE_HOST`, `UI_SMOKE_PORT`, `UI_SMOKE_BASE_URL`)
  - Runs end-to-end smoke flows with fixed viewport and strict selectors
  - Writes machine-readable reports and screenshots
  - Exits non-zero on any regression
- `npm run check:ui-smoke`
  - Reads `reports/ui-smoke/latest.json`
  - Fails if suite is unhealthy, any flow failed, any runtime issues were captured, or screenshots are missing

## Covered flows

1. `/dashboard/agents`
2. `/dashboard/automations`
3. `/dashboard/report`
   - Includes deterministic entry switching validation (must have at least 2 report entries)

## Artifacts

- `reports/ui-smoke/latest.json`
- `reports/ui-smoke/ui-smoke-<timestamp>.json`
- `reports/ui-smoke/screenshots/<timestamp>-*.png`

Each flow records:

- pass/fail
- screenshot path
- console warnings/errors
- page errors and unhandled rejections
- network request failures

## Determinism rules

- Fixed viewport: `1440x900`
- Fixed post-navigation wait: `400ms`
- Strict selectors via `data-testid`
- Stable per-flow JSON schema for machine checks

## CI/runtime blocking

Use this sequence as a guardrail gate:

1. `npm run ui:smoke`
2. `npm run check:ui-smoke`

The second command is intended to be the blocking gate. If either command exits non-zero, treat as regression.
