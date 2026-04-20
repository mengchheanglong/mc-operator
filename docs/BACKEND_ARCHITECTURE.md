# Backend Architecture

## Overview

NestJS backend serving as the data layer for mc-operator.
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

The frontend uses a single catch-all proxy route at:

- `src/app/api/[...path]/route.ts`
- `src/platform/http/backend-proxy.ts`

Browser requests go through the Next.js app, then forward to the Nest backend.

When the backend is unavailable, write requests fail explicitly with a backend-required
error. There is no generic local read-fallback layer in the current proxy path.

## Conventions for New Modules

1. Create `modules/<name>/` with controller + service
2. Register both in `app.module.ts` (controllers + providers)
3. Inject `SqliteService` for data access
4. Use `infra/service-utils.ts` for common patterns (normalizeString, resolveOperator, etc.)
5. Ensure the route is reachable through the catch-all proxy surface
6. Write operations must fail explicitly when the backend is unavailable
7. Extend the current backend/API verification surface where needed

## Environment Variables

| Variable | Default | Used In |
|----------|---------|---------|
| `MISSION_CONTROL_BACKEND_PORT` | `3201` | main.ts |
| `MISSION_CONTROL_BACKEND_HOST` | `127.0.0.1` | main.ts |
| `SQLITE_PATH` | `../data/openclaw.db` | SqliteService |
| `MISSION_CONTROL_DEFAULT_PROJECT_ID` | `mc-operator` | SqliteService |
| `OPENCLAW_WORKSPACE_ROOT` | auto-detected | ProjectPathsService |
| `MISSION_CONTROL_PERSONAL_PROJECTS` | (none) | ProjectsService |

## Known Architecture Debt

- DTO/class-validator coverage is still partial
- Some modules still have inconsistent response envelopes
- There is still room to factor more shared helpers across services
- UI smoke is broad, but interaction-level end-to-end coverage is still lighter than route coverage
