# UI Smoke Guardrails

Mission Control uses an isolated UI smoke runner to prove that the active operator surface renders against a live backend.

## Commands

- `npm run ui:smoke`
  - starts an isolated backend
  - builds the web app
  - starts the production server on a temporary local port
  - runs browser smoke checks with Puppeteer
  - writes screenshots and a machine-readable report
- `npm run check:ui-smoke`
  - reads `reports/ui-smoke/latest.json`
  - fails if the report is unhealthy, any flow failed, runtime issues were captured, or screenshots are missing

## Covered Routes

The smoke currently covers:

1. `/health`
2. `/quests`
3. `/reports`
4. `/docs`
5. `/notes`
6. `/projects`
7. `/views`
8. `/agents`
9. `/automation`
10. `/ops`
11. `/workspace/bootstrap`
12. `/directive`

## Artifacts

Generated output is written to:

- `reports/ui-smoke/latest.json`
- `reports/ui-smoke/ui-smoke-<timestamp>.json`
- `reports/ui-smoke/screenshots/<timestamp>-*.png`

These are runtime artifacts and are intentionally ignored by Git.

## Guardrail Intent

This smoke is not deep interaction coverage. Its job is to catch:

- broken route boot
- obvious frontend/backend surface mismatches
- rendering failures
- missing critical controls
- console/page/network failures during initial operator load

## Release Usage

Treat the following as the UI release gate:

1. `npm run ui:smoke`
2. `npm run check:ui-smoke`

Both commands are included in `npm run verify:product`.
