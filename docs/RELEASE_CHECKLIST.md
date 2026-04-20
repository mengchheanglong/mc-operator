# Release Checklist

Use this checklist before calling the current local-first Mission Control build releasable.

## Product Gate

Run:

```bash
npm run verify:product
```

Required result:

- all checks pass without manual patching

This gate covers:

- `npm test`
- `npm run typecheck`
- `scripts/check-backend-api-suite.ts`
- `npm run ui:smoke`
- `npm run check:ui-smoke`

## Local Runtime

Confirm:

- `npm install` completes on the target machine
- `npm run dev` starts the web app
- `npm run backend:dev` starts the Nest backend when run separately
- required `.env` values are present or intentionally omitted
- SQLite/data paths are writable

## Operator Surface

Confirm the main routes render and behave on the target machine:

- `/health`
- `/quests`
- `/reports`
- `/docs`
- `/notes`
- `/projects`
- `/views`
- `/agents`
- `/automation`
- `/directive`
- `/ops`
- `/workspace/bootstrap`

## Data and Artifacts

Confirm:

- project-scoped writes land under the intended active project
- repo-local knowledge uses `.openclaw/knowledge`
- generated context uses `.openclaw/context`
- UI smoke artifacts remain treated as generated output under `reports/ui-smoke/`

## Release Notes

Before handoff, record:

- notable contract changes
- environment assumptions
- known non-blocking limitations
- any post-release cleanup backlog

## Handoff Standard

The build is releasable for this phase when:

- the product gate passes
- the operator routes render against a live backend
- no known blocker remains in frontend/backend contract alignment
- remaining work is documented as backlog rather than unresolved baseline debt
