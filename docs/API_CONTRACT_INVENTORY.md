# Mission Control API Contract Inventory

Last updated: 2026-04-20

## Purpose

This document inventories the active frontend API clients against the current Nest backend route surface.

It is meant to answer three questions:

1. Which routes are actively used by the frontend?
2. What response shape does each route currently expose?
3. Where are the current mismatches or unfinished contracts?

## Canonical Boundary

- Browser pages call `apiRequest()` in [`src/features/shared/api-client.ts`](../src/features/shared/api-client.ts)
- `apiRequest()` targets `/api/...`
- [`src/app/api/[...path]/route.ts`](../src/app/api/%5B...path%5D/route.ts) forwards every method into [`src/platform/http/backend-proxy.ts`](../src/platform/http/backend-proxy.ts)
- The proxy normalizes paths into backend routes under `/api/v1/...`
- The shared client automatically appends `projectId` for most requests based on the Zustand app store

## Response Envelope Reality

The backend does not use one uniform response style.

Current patterns include:

- raw arrays or objects
- `{ msg, <entity> }`
- `{ ok, <entity> }`
- `{ success, <entity> }`
- feature-specific wrappers such as `{ runs, staleRuns }`, `{ guards }`, `{ docs }`, `{ pack }`

This inconsistency is one of the main reasons some UI pages are only partially aligned.

## Active Frontend Clients

## Health

### Frontend

- client: [`src/features/health/api.ts`](../src/features/health/api.ts)
- call: `GET /api/health`

### Backend

- route: `GET /api/v1/health`
- controller: [`backend/src/modules/health/health.controller.ts`](../backend/src/modules/health/health.controller.ts)

### Current Response

```json
{
  "ok": true,
  "service": "mc-operator-backend",
  "dbPath": "...",
  "users": 1,
  "timestamp": "..."
}
```

### Status

- aligned

## Quests

### Frontend

- client: [`src/features/quests/api.ts`](../src/features/quests/api.ts)
- calls:
  - `GET /api/quests?...`
  - `GET /api/quests/:id`
  - `POST /api/quests`
  - `PUT /api/quests/:id`
  - `PUT /api/quests/:id/complete`
  - `DELETE /api/quests/:id`

### Backend

- controller: [`backend/src/modules/quests/quests.controller.ts`](../backend/src/modules/quests/quests.controller.ts)

### Current Response Shape

- list: raw array of quests by default, or `{ quests, meta }` when `withMeta=1`
- get: `{ quest }`
- create: `{ msg, quest }`
- update: `{ msg, quest, transition, verificationEvidence }`
- complete: `{ msg, quest, verificationEvidence }`
- delete: `{ msg }`

### Status

- aligned for the current UI path
- note: the frontend now requests `withMeta=1` so the page consistently receives `{ quests, meta }`

## Reports

### Frontend

- client: [`src/features/reports/api.ts`](../src/features/reports/api.ts)
- calls:
  - `GET /api/reports?...`
  - `POST /api/reports`
  - `DELETE /api/reports/:id`

### Backend

- controller: [`backend/src/modules/reports/reports.controller.ts`](../backend/src/modules/reports/reports.controller.ts)

### Current Response Shape

- list: raw list payload from service, or `{ days }` when `view=daily`
- create: `{ msg, report }`
- delete: `{ msg }`

### Status

- aligned for the current UI path
- note: the frontend now requests `withMeta=1` so the page consistently receives `{ reports, meta }`
- note: `view=daily` still changes the top-level shape for any future daily-log UI

## Docs

### Frontend

- client: [`src/features/docs/api.ts`](../src/features/docs/api.ts)
- calls:
  - `GET /api/docs`
  - `POST /api/docs`
  - `PUT /api/docs/:id`
  - `DELETE /api/docs/:id`

### Backend

- controller: [`backend/src/modules/docs/docs.controller.ts`](../backend/src/modules/docs/docs.controller.ts)

### Current Response Shape

- list: `{ docs }`
- get by id exists in backend but is not used by the current frontend client
- create: `{ msg, doc }`
- update: `{ msg, doc }`
- delete: `{ msg }`

### Status

- aligned for active client calls
- note: the frontend now uses backend-supported `search`, `tag`, and `fileType` filters
- note: document creation now sends `fileType` and `scope` instead of the old placeholder category field

## Notes

### Frontend

- client: [`src/features/notes/api.ts`](../src/features/notes/api.ts)
- calls:
  - `GET /api/notes`
  - `POST /api/notes`
  - `PUT /api/notes/:id`
  - `DELETE /api/notes/:id`

### Backend

- controller: [`backend/src/modules/notes/notes.controller.ts`](../backend/src/modules/notes/notes.controller.ts)

### Current Response Shape

- list: `{ notes }`
- create: `{ msg, note }`
- update: `{ msg, note }`
- delete: `{ msg }`

### Status

- aligned

## Views

### Frontend

- client: [`src/features/views/api.ts`](../src/features/views/api.ts)
- calls:
  - `GET /api/views`
  - `POST /api/views`
  - `DELETE /api/views/:id`

### Backend

- controller: [`backend/src/modules/views/views.controller.ts`](../backend/src/modules/views/views.controller.ts)

### Current Response Shape

- list: `{ views }`
- create: `{ msg, view }`
- delete: `{ msg }`

### Status

- aligned
- note: the create form now validates JSON client-side to avoid invalid filter payloads

## Projects

### Frontend

- client: [`src/features/projects/api.ts`](../src/features/projects/api.ts)
- calls:
  - `GET /api/projects`
- local-only helper:
  - `activate(id)` returns `{ activeProjectId: id }` without calling the backend

### Backend

- controller: [`backend/src/modules/projects/projects.controller.ts`](../backend/src/modules/projects/projects.controller.ts)
- routes:
  - `GET /api/v1/projects`
  - `GET /api/v1/projects/graph`

### Current Response Shape

- list: `{ activeProject, projects }`
- graph: `{ activeProject, projects }`

### Status

- partially aligned
- note: frontend "activate" is only a local state change, not a persisted backend action
- note: backend graph route exists but is not represented in the current projects client

## Agents

### Frontend

- client: [`src/features/agents/api.ts`](../src/features/agents/api.ts)
- calls:
  - `GET /api/agents`
  - `POST /api/agents`
  - `GET /api/agents/:id/status`
  - `POST /api/agents/:id/restore`
  - `POST /api/agents/:id/kill`
  - `POST /api/agents/:id/dispatch`
  - `POST /api/agents/import-packs`

### Backend

- controllers:
  - catalog: [`backend/src/modules/agents-catalog/agents-catalog.controller.ts`](../backend/src/modules/agents-catalog/agents-catalog.controller.ts)
  - runtime: [`backend/src/modules/agents-runtime/agents-runtime.controller.ts`](../backend/src/modules/agents-runtime/agents-runtime.controller.ts)
  - dispatch: [`backend/src/modules/agents-dispatch/agents-dispatch.controller.ts`](../backend/src/modules/agents-dispatch/agents-dispatch.controller.ts)
  - import packs: `backend/src/modules/agents-import-packs/agents-import-packs.controller.ts`

### Current Response Shape

- list: `{ agents }`
- create: `{ msg, agent }`
- status: backend returns a status payload, not a simple agent row
- kill / restore: `{ msg, agent, ...result }`
- dispatch: `{ msg, agent, run }` on success, error payload on failure
- import packs: feature-specific wrapper from import-pack module

### Status

- mostly aligned for route names
- note: runtime and dispatch responses are operational payloads, not simple entity fetches
- note: backend also exposes `PUT /agents/:id`, `DELETE /agents/:id`, `GET /agents/:id/pack-assets`, and `POST /agents/:id/send`, which the current client does not surface

## Automation

### Frontend

- client: [`src/features/automation/api.ts`](../src/features/automation/api.ts)
- calls:
  - `GET /api/automation/runs`
  - `GET /api/automation/runs/:id/summary`
  - `POST /api/automation/runs`
  - `POST /api/automation/runs/:id/close`
  - `GET /api/automation/templates`
  - `POST /api/automation/templates`
  - `PUT /api/automation/templates/:id`
  - `DELETE /api/automation/templates/:id`
  - `GET /api/automation/templates/:id/runs`
  - `POST /api/automation/templates/:id/run`
  - `POST /api/automation/templates/:id/check`
  - `POST /api/automation/templates/:id/execute`
  - `GET /api/automation/openclaw/health`
  - `GET /api/automation/n8n/status`

### Backend

- controllers:
  - runs: [`backend/src/modules/automation-runs/automation-runs.controller.ts`](../backend/src/modules/automation-runs/automation-runs.controller.ts)
  - templates: [`backend/src/modules/automation-template-execute/automation-template-execute.controller.ts`](../backend/src/modules/automation-template-execute/automation-template-execute.controller.ts)
  - health: [`backend/src/modules/automation-health/automation-health.controller.ts`](../backend/src/modules/automation-health/automation-health.controller.ts)
  - session brief: [`backend/src/modules/automation-session-brief/automation-session-brief.controller.ts`](../backend/src/modules/automation-session-brief/automation-session-brief.controller.ts)

### Current Response Shape

- list runs: `{ runs, staleRuns }`
- run summary: `{ run, summary: { lastDispatch, verificationArtifacts } }`
- create run: `{ msg, run }`
- close run: `{ msg, run }`
- list templates: `{ templates }`
- create/update template: `{ msg, template }`
- delete template: `{ msg }`
- template history: `{ success, templateId, runs }`
- prepare template: `{ msg, template, run }`
- check template: `{ msg, template, evaluation }`
- execute template: success payload with `{ msg, template, run }`
- openclaw health: provider-specific health payload
- n8n status: `{ success, automation }`
- session brief: requires `x-openclaw-automation-token`; can return JSON or markdown depending on `format`

### Status

- aligned for the current operator UI path

### Known Mismatches

- The session brief endpoint remains automation-only because it requires `x-openclaw-automation-token`; the browser client intentionally does not expose it.

## Directive Workspace

### Frontend

- client: [`src/features/directive/api.ts`](../src/features/directive/api.ts)
- calls:
  - `GET /api/directive-workspace/registry`
  - `GET /api/directive-workspace/workspace/overview`
  - `GET /api/directive-workspace/discovery/overview`
  - `GET /api/directive-workspace/architecture/overview`
  - `POST /api/directive-workspace/capabilities`
  - `POST /api/directive-workspace/capabilities/:id/analysis`
  - `POST /api/directive-workspace/capabilities/:id/experiments`
  - `POST /api/directive-workspace/capabilities/:id/evaluations`
  - `POST /api/directive-workspace/capabilities/:id/decision`
  - `POST /api/directive-workspace/capabilities/:id/proof`
  - `POST /api/directive-workspace/capabilities/:id/lifecycle`

### Backend

- controller: [`backend/src/modules/directive-workspace/directive-workspace.controller.ts`](../backend/src/modules/directive-workspace/directive-workspace.controller.ts)
- additional backend routes not represented in the current client:
  - `GET /directive-workspace/capabilities/:id/lifecycle`
  - `GET /directive-workspace/registry`
  - `GET /directive-workspace/workspace/overview`
  - `GET /directive-workspace/discovery/overview`
  - `GET /directive-workspace/architecture/overview`

### Current Response Shape

- list capabilities: `{ v0, capabilities }`
- registry: `{ v0, registry }`
- create capability: `{ ok, capability }`
- workspace overview: `{ v0, workspace }`
- discovery overview: `{ v0, discovery }`
- architecture overview: `{ v0, architecture }`
- analysis / experiment / evaluation: `{ ok, capability|experiment|evaluation }`
- decision / proof / lifecycle: feature-specific wrappers with `ok` plus lifecycle payload

### Status

- aligned for the current registry, overview, and create flows

### Known Mismatches

- aligned for the current UI path, including direct lifecycle reads for the selected capability panel.

## Ops

### Frontend

- client: [`src/features/ops/api.ts`](../src/features/ops/api.ts)
- calls:
  - `GET /api/ops/health`
  - `GET /api/ops/nightly`
  - `GET /api/workflow/guards`

### Backend

- controllers:
  - ops health: [`backend/src/modules/ops-health/ops-health.controller.ts`](../backend/src/modules/ops-health/ops-health.controller.ts)
  - ops nightly: [`backend/src/modules/ops-nightly/ops-nightly.controller.ts`](../backend/src/modules/ops-nightly/ops-nightly.controller.ts)
  - workflow guards: [`backend/src/modules/workflow-guards/workflow-guards.controller.ts`](../backend/src/modules/workflow-guards/workflow-guards.controller.ts)

### Current Response Shape

- ops health: `{ ok, generatedAt, overallOk, maxAgeHours, items... }` or failing-only payload when `view=failing`
- nightly: route-specific read payload from nightly service
- workflow guards: `{ guards }`

### Status

- aligned for current read-only use
- note: the stale `triggerNightly()` helper has been removed from the frontend client

## Code Graph

### Frontend

- client: [`src/features/code-graph/api.ts`](../src/features/code-graph/api.ts)
- call: `POST /api/code-graph/index`

### Backend

- controller: [`backend/src/modules/code-graph-index/code-graph-index.controller.ts`](../backend/src/modules/code-graph-index/code-graph-index.controller.ts)

### Current Response Shape

- success: `{ success, message, output }`
- failure: HTTP error with `{ success, message, output }`

### Status

- aligned
- note: depends on `cgc` being available on `PATH`

## Context Export

### Frontend

- client: [`src/features/context/api.ts`](../src/features/context/api.ts)
- call: `GET /api/context/export`

### Backend

- controller: [`backend/src/modules/context-export/context-export.controller.ts`](../backend/src/modules/context-export/context-export.controller.ts)

### Current Response Shape

- `{ success, pack }`

### Status

- aligned

## Workspace Bootstrap

### Frontend

- client: [`src/features/workspace/api.ts`](../src/features/workspace/api.ts)
- call: `POST /api/workspace/bootstrap`

### Backend

- controller: [`backend/src/modules/workspace-bootstrap/workspace-bootstrap.controller.ts`](../backend/src/modules/workspace-bootstrap/workspace-bootstrap.controller.ts)

### Current Response Shape

- bootstrap result with `msg`, `createdDocs`, `createdQuest`, and `firstDocId`

### Status

- aligned

## Known Cross-Cutting Contract Problems

### 1. Mixed Envelopes

The UI cannot safely assume one response convention. Some list routes return arrays, some return `{ items }`, and some switch based on query params.

### 2. Rich Backend, Thin Placeholder UI

Automation and directive are the clearest examples. The backend models are meaningfully richer than the page components.

### 3. Operator Routes vs Automation Routes

Some routes, especially automation session-brief, appear intended for machine-to-machine use and should not be treated as ordinary browser UI calls without additional auth handling.

### 4. Proxy Messaging

The proxy says read operations "may use fallback" when the backend is unreachable, but the proxy itself currently returns a `503` payload for read failures rather than performing a real read fallback.

## Recommended Next Repairs

1. Normalize and document canonical response envelopes for active UI routes.
2. Repair the automation page against the real workspace-run and template-execute payloads.
3. Repair the directive page against the actual capability lifecycle model.
4. Decide which routes are browser/operator routes and which are automation-only integration endpoints.
5. Update or remove frontend helpers that imply routes or semantics that do not exist yet.
