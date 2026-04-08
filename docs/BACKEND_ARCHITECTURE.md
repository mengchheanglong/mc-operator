# Backend Architecture

## Overview

NestJS backend serving as the data layer for mission-control.
Listens on `http://127.0.0.1:3201` by default (configurable via `MISSION_CONTROL_BACKEND_PORT`).

## Directory Structure

```
backend/src/
  main.ts                       # Bootstrap, CORS, port binding
  app.module.ts                 # Single root module registering all controllers/providers
  smoke.ts                      # Smoke test entry point
  infra/
    sqlite/sqlite.service.ts    # SQLite connection, schema init, lifecycle
    project-paths.service.ts    # Workspace/project path resolution
    service-utils.ts            # Shared utilities (normalizeString, resolveOperator, etc.)
  modules/
    health/                     # GET /health — liveness probe
    quests/                     # CRUD for quests
    docs/                       # CRUD for docs (DB + file-backed)
    reports/                    # CRUD for reports
    notes/                      # CRUD for notes
    views/                      # CRUD for saved views
    projects/                   # Project listing, activation
    agents-catalog/             # Agent CRUD (catalog metadata)
    agents-runtime/             # Agent session lifecycle (start/stop/status)
    agents-dispatch/            # Agent dispatch (trigger execution)
    agents-import-packs/        # Import agent packs
    agents-extras/              # Agent pack-assets, send, kill, restore
    automation-runs/            # Workspace automation run lifecycle
    automation-run-tools/       # Per-run tool execution
    automation-health/          # Automation health checks
    automation-template-execute/# Template execution engine
    automation-session-brief/   # Session brief generation
    directive-workspace/        # Directive capability lifecycle
    workflow-guards/            # Workflow guardrails
    workspace-bootstrap/        # Workspace bootstrap/init
    context-export/             # Context export for agents
    code-graph-index/           # Code graph indexing
    ops-health/                 # Ops health dashboard
    ops-nightly/                # Nightly ops runs
```

## Module Pattern

Each module follows a consistent pattern:
- **Controller** (`*.controller.ts`): Route definitions, HTTP concerns, error mapping
- **Service** (`*.service.ts`): Business logic, data access, validation

All modules are registered flat in `app.module.ts`.

## Shared Infrastructure

### SqliteService (`infra/sqlite/sqlite.service.ts`)
- Manages a single `better-sqlite3` connection
- Initializes all core tables on startup
- Provides `connection` getter for raw DB access
- Implements `OnModuleDestroy` for clean shutdown

### ProjectPathsService (`infra/project-paths.service.ts`)
- Resolves workspace root, project root, relative paths
- Handles `OPENCLAW_WORKSPACE_ROOT` env var

### service-utils.ts (`infra/service-utils.ts`)
- `normalizeString(value)` — trim + coerce unknown to string
- `resolveProjectId(projectId?)` — with default fallback
- `resolveOperator(db)` — find or create default user
- `parseJsonObject(value)` / `parseJsonArray(value)` — safe JSON parsing

## Route Ownership

| Route Prefix              | Controller                     | Backend Module               |
|---------------------------|--------------------------------|------------------------------|
| `/api/v1/quests`          | QuestsController               | quests                       |
| `/api/v1/docs`            | DocsController                 | docs                         |
| `/api/v1/reports`         | ReportsController              | reports                      |
| `/api/v1/notes`           | NotesController                | notes                        |
| `/api/v1/views`           | ViewsController                | views                        |
| `/api/v1/projects`        | ProjectsController             | projects                     |
| `/api/v1/agents`          | AgentsCatalogController        | agents-catalog               |
| `/api/v1/agents/:id/*`    | AgentsRuntime/Dispatch/Extras  | agents-runtime/dispatch/extras|
| `/api/v1/automation/runs` | AutomationRunsController       | automation-runs              |
| `/api/v1/automation/templates` | AutomationTemplateExecute | automation-template-execute   |
| `/api/v1/directive-workspace` | DirectiveWorkspaceController | directive-workspace          |
| `/api/v1/health`          | HealthController               | health                       |

## Proxy Architecture (Next.js -> Nest)

All frontend API routes proxy to the backend via `proxyBackendRequest()` in
`src/server/http/directive-backend-proxy.ts`.

**Write policy**: When the backend is unreachable and the request is a write
(POST/PUT/DELETE/PATCH), the proxy returns:
```json
{
  "msg": "This write operation requires the backend to be running.",
  "code": "backend_required_for_write",
  "detail": "Start backend with `npm run backend:dev`..."
}
```
Status: **502**

**Read fallback**: Quests, docs, and reports have local SQLite fallback when
the backend is down (GET only).

## Conventions for New Modules

1. Create `modules/<name>/` with controller + service
2. Register both in `app.module.ts` (controllers + providers)
3. Inject `SqliteService` for data access
4. Use `infra/service-utils.ts` for common patterns (normalizeString, resolveOperator, etc.)
5. Add corresponding Next.js API route in `src/app/api/<name>/route.ts`
6. Write operations must produce `backend_required_for_write` on 502
7. Add a `check:<name>-api-backend` script for integration testing

## Environment Variables

| Variable | Default | Used In |
|----------|---------|---------|
| `MISSION_CONTROL_BACKEND_PORT` | `3201` | main.ts |
| `MISSION_CONTROL_BACKEND_HOST` | `127.0.0.1` | main.ts |
| `SQLITE_PATH` | `../data/openclaw.db` | SqliteService |
| `MISSION_CONTROL_DEFAULT_PROJECT_ID` | `mission-control` | SqliteService |
| `OPENCLAW_WORKSPACE_ROOT` | auto-detected | ProjectPathsService |
| `MISSION_CONTROL_PERSONAL_PROJECTS` | (none) | ProjectsService |

## Known Architecture Debt

- No DTO/class-validator integration (validation is in services)
- No repository layer (raw SQL in services)
- Duplicated path resolution across DocsService, AutomationRunsService, AgentsRuntimeService
- Inconsistent response envelopes across modules
- No test infrastructure (no spec files)
