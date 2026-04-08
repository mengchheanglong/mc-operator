# Nest Backend Slice 01

Date: 2026-03-18
Updated: 2026-03-18 (Slice 14 full API proxy migration + 100% route coverage)

## Why

Mission Control has outgrown a Next.js-only backend shape. The current app mixes:

- dashboard UI
- API routes
- orchestration services
- SQLite access
- runtime/ops jobs

This slice creates a separate NestJS backend lane without breaking the existing Next.js app.

## What Exists Now

Source path:

- `backend/`

Root scripts:

- `npm run backend:dev`
- `npm run backend:build`
- `npm run backend:start`

Backend folder layout:

- `backend/src/app.module.ts`
- `backend/src/main.ts`
- `backend/src/smoke.ts`
- `backend/src/infra/sqlite/sqlite.service.ts`
- `backend/src/modules/health/*`
- `backend/src/modules/directive-workspace/*`
- `backend/src/modules/reports/*`
- `backend/src/modules/projects/*`
- `backend/src/modules/notes/*`
- `backend/src/modules/views/*`
- `backend/src/modules/quests/*`
- `backend/src/modules/docs/*`
- `backend/src/modules/automation-runs/*`

Installed NestJS-support dependencies:

- `@nestjs/config`
- `class-validator`
- `class-transformer`

Current Nest endpoints:

- `GET /api/v1/health`
- `GET /api/v1/directive-workspace/capabilities`
- `POST /api/v1/directive-workspace/capabilities`
- `GET /api/v1/directive-workspace/capabilities/:id`
- `GET /api/v1/directive-workspace/capabilities/:id/lifecycle`
- `POST /api/v1/directive-workspace/capabilities/:id/analysis`
- `POST /api/v1/directive-workspace/capabilities/:id/experiments`
- `POST /api/v1/directive-workspace/capabilities/:id/evaluations`
- `POST /api/v1/directive-workspace/capabilities/:id/decision`
- `POST /api/v1/directive-workspace/capabilities/:id/proof`
- `POST /api/v1/directive-workspace/capabilities/:id/lifecycle`
- `GET /api/v1/directive-workspace/registry`
- `GET /api/v1/reports`
- `POST /api/v1/reports`
- `DELETE /api/v1/reports/:id`
- `GET /api/v1/projects`
- `GET /api/v1/projects/graph`
- `GET /api/v1/notes`
- `POST /api/v1/notes`
- `PUT /api/v1/notes/:id`
- `DELETE /api/v1/notes/:id`
- `GET /api/v1/views`
- `POST /api/v1/views`
- `DELETE /api/v1/views/:id`
- `GET /api/v1/quests`
- `POST /api/v1/quests`
- `PUT /api/v1/quests/:id`
- `DELETE /api/v1/quests/:id`
- `PUT /api/v1/quests/:id/complete`
- `GET /api/v1/docs`
- `POST /api/v1/docs`
- `GET /api/v1/docs/:id`
- `PUT /api/v1/docs/:id`
- `DELETE /api/v1/docs/:id`
- `GET /api/v1/automation/runs`
- `POST /api/v1/automation/runs`
- `POST /api/v1/automation/runs/:id/close`
- `GET /api/v1/automation/runs/:id/summary`
- `GET /api/v1/automation/session-brief`
- `GET /api/v1/context/export`
- `POST /api/v1/code-graph/index`
- `POST /api/v1/workspace/bootstrap`
- `GET /api/v1/ops/nightly`

## Runtime Model

- Next.js remains the active UI/runtime entrypoint.
- NestJS is a parallel backend service.
- Both currently point at the same SQLite database.
- Nest now self-initializes required SQLite tables on fresh databases.

## Migration Status

Backend/API migration coverage now:

- `57 / 57` route files proxy through backend (`100%`)
- all backend API suite and orchestrator readiness gates are green
- compatibility endpoints for session brief/context export/nightly/bootstrap are now served by Nest

Current backend cut proves:

1. a separate Nest runtime can coexist safely
2. directive intake + lifecycle write paths are executable in Nest (including lifecycle POST orchestration)
3. Next directive routes can run as proxy/BFF handlers against Nest for core directive endpoints
4. directive checks/lifecycle runner now validate through API proxy + backend (not local lifecycle service)
5. `/api/reports` GET now proxies to backend (`view=daily`, list, and `withMeta` paths)
6. `/api/projects` and `/api/projects/graph` GET now proxy to backend
7. the repo can build and smoke-test end-to-end backend lifecycle + reports/projects read calls
8. reports create/delete now run through backend endpoints while Next keeps dashboard context side effects
9. `directive:backfill:proof` now uses backend directive APIs (backend-first adapter) instead of local directive repository/service calls
10. `directive:seed:candidates` now uses backend directive APIs (create/list/analysis)
11. `directive:lifecycle` now uses backend directive APIs (capability, proof, lifecycle, report verification)
12. `/api/ops/repo-sources` writes reports via backend `/api/v1/reports` proxy instead of local `createReport`
13. `/api/notes` and `/api/notes/[id]` now proxy to backend notes endpoints
14. `/api/views` and `/api/views/[id]` now proxy to backend views endpoints
15. backend smoke and dedicated checks now validate notes/views backend mutation roundtrips
16. `/api/quests`, `/api/quests/[id]`, `/api/quests/[id]/complete` now proxy to backend quest endpoints
17. `/api/docs`, `/api/docs/[id]` now proxy to backend docs endpoints while preserving Next response contract (`_id`, `links`) and context side effects
18. backend smoke and dedicated checks now validate quest/doc backend mutation roundtrips
19. `/api/automation/runs`, `/api/automation/runs/create`, `/api/automation/runs/[id]/close`, and `/api/automation/runs/[id]/summary` now proxy to backend automation-runs endpoints
20. backend automation-runs service now owns run list/create/close/summary behavior with retry-pending-cleanup and stale-run detection
21. dedicated backend check now validates automation-runs proxy + backend roundtrip against an isolated temp git repository
22. `/api/automation/openclaw/health` and `/api/automation/n8n/status` now validate against backend automation-health endpoints
23. `/api/automation/reports`, `/api/automation/quests`, `/api/projects/active`, `/api/projects/activate`, `/api/workflow/guards`, and `/api/ops/health` now proxy through backend-first paths
24. backend now exposes `/api/v1/workflow/guards` and `/api/v1/ops/health`, plus sqlite bootstrap for `workflow_run_guards`
25. dedicated migration-batch check validates migration-batch proxy routes in one backend roundtrip suite
26. remaining compatibility routes (`session-brief`, `context/export`, `code-graph/index`, `workspace/bootstrap`, `ops/nightly`) now proxy to backend-first endpoints

## Verification

Verified commands:

- `npm run backend:build`
- `npm --prefix ./backend run smoke`
- `npm run check:directive-intake-api`
- `npm run check:directive-workspace-v0`
- `npm run check:directive-integration-proof`
- `npm run directive:lifecycle -- agency-agents mission-control`
- `npm run check:reports-api-backend`
- `npm run check:projects-api-backend`
- `npm run check:notes-api-backend`
- `npm run check:views-api-backend`
- `npm run check:quests-api-backend`
- `npm run check:docs-api-backend`
- `npm run check:automation-runs-api-backend`
- `npm run check:automation-health-api-backend`
- `npm run check:migration-batch-api-backend`
- `npm run check:backend-api-suite`
- `npm run check:orchestrator-readiness`

Smoke result at bootstrap time:

- health: ok
- created capability + lifecycle path: ok
- analysis/experiments/evaluations/decision/proof: ok
- lifecycle readback status: `decided`

## Next Migration Slice

Next slice should continue backend-first migration for remaining local-write Next routes:

1. migrate remaining run/agent orchestration APIs to backend-first endpoints (keep Next as BFF where needed)
2. migrate run-scoped tools endpoints (`/api/automation/runs/[id]/tools`, `.../tooling-audit`) to backend-first while preserving deprecation behavior
3. add backend-first checks for those migrated orchestration endpoints and wire into readiness/ops stack where appropriate

After Slice 11+, the remaining local-write paths should be limited to explicitly non-migrated legacy routes.
