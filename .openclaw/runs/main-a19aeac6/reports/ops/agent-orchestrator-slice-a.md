# Agent-Orchestrator Slice A (worktree-per-run)

## 1) Files changed (absolute paths)
- C:\Users\User\.openclaw\workspace\mission-control\src\server\sqlite\schema.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\server\sqlite\db.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\server\repositories\workspace-runs-repo.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\server\services\workspace-run-service.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\app\api\automation\runs\route.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\app\api\automation\runs\create\route.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\app\api\automation\runs\[id]\close\route.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\app\api\agents\[id]\dispatch\route.ts

## 2) Exact commands run
1. `npm run typecheck`
2. `npm run lint`
3. `npm run build`
4. `npm test`
5. `npm run check:adapters`
6. `npm run check:canary-health`
7. `npx tsx -e "import { findOrCreateUser } from './src/server/repositories/users-repo'; import { resolveProjectById } from './src/server/context/project-context'; import { createRun, listRuns, closeRun } from './src/server/services/workspace-run-service'; import { execSync } from 'child_process'; (async () => { const user = findOrCreateUser(); const project = resolveProjectById('mission-control'); const branch = execSync('git rev-parse --abbrev-ref HEAD',{cwd: project.rootPath}).toString().trim(); const run = await createRun({userId:user.id, project, branch, metadata:{smoke:'slice-a'}}); const runs = listRuns({userId:user.id, projectId:project.id}).slice(0,3); const closed = await closeRun({userId:user.id, project, runId:run.id, archive:false}); console.log(JSON.stringify({created:run.id, worktree:run.worktreePath, listed:runs.map(r=>({id:r.id,status:r.status,branch:r.branch})), closed:{id:closed?.id,status:closed?.status}}, null, 2)); })();"`

## 3) Raw outputs
### 1) npm run typecheck
```text
> mission-control@1.0.0 typecheck
> tsc --noEmit --project tsconfig.typecheck.json --incremental false
```

### 2) npm run lint
```text
> mission-control@1.0.0 lint
> eslint . --ext .js,.jsx,.ts,.tsx
```

### 3) npm run build
```text
> mission-control@1.0.0 build
> next build

▲ Next.js 16.1.6 (Turbopack)
- Environments: .env
- Experiments (use with caution):
  · optimizePackageImports

  Creating an optimized production build ...
✓ Compiled successfully in 10.6s
  Running TypeScript ...
  Collecting page data using 19 workers ...
  Generating static pages using 19 workers (0/3) ...
✓ Generating static pages using 19 workers (3/3) in 64.0ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/agents
├ ƒ /api/agents/[id]
├ ƒ /api/agents/[id]/dispatch
├ ƒ /api/agents/[id]/kill
├ ƒ /api/agents/[id]/pack-assets
├ ƒ /api/agents/[id]/restore
├ ƒ /api/agents/[id]/send
├ ƒ /api/agents/[id]/status
├ ƒ /api/agents/import-packs
├ ƒ /api/automation/n8n/status
├ ƒ /api/automation/openclaw/health
├ ƒ /api/automation/quests
├ ƒ /api/automation/reports
├ ƒ /api/automation/runs
├ ƒ /api/automation/runs/[id]/close
├ ƒ /api/automation/runs/create
├ ƒ /api/automation/session-brief
├ ƒ /api/automation/templates
├ ƒ /api/automation/templates/[id]
├ ƒ /api/automation/templates/[id]/check
├ ƒ /api/automation/templates/[id]/execute
├ ƒ /api/automation/templates/[id]/run
├ ƒ /api/automation/templates/[id]/runs
├ ƒ /api/code-graph/index
├ ƒ /api/context/export
├ ƒ /api/docs
├ ƒ /api/docs/[id]
├ ƒ /api/notes
├ ƒ /api/notes/[id]
├ ƒ /api/projects
├ ƒ /api/projects/activate
├ ƒ /api/projects/active
├ ƒ /api/projects/graph
├ ƒ /api/quests
├ ƒ /api/quests/[id]
├ ƒ /api/quests/[id]/complete
├ ƒ /api/reports
├ ƒ /api/reports/[id]
├ ƒ /api/views
├ ƒ /api/views/[id]
├ ƒ /api/workflow/guards
├ ƒ /api/workspace/bootstrap
├ ƒ /dashboard
├ ƒ /dashboard/agents
├ ƒ /dashboard/automations
├ ƒ /dashboard/decisions
├ ƒ /dashboard/docs
├ ƒ /dashboard/graph
├ ƒ /dashboard/notes
├ ƒ /dashboard/prompt-pack
├ ƒ /dashboard/quests
└ ƒ /dashboard/report

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### 4) npm test
```text
> mission-control@1.0.0 test
> node --experimental-strip-types --test ./tests/runtime/*.test.ts

✔ adapter gate accepts valid input/output (1.4915ms)
✔ adapter gate rejects invalid input (0.6398ms)
✔ adapter gate timeout path returns normalized timeout error (21.1174ms)
✔ adapter gate retry exhaustion path returns normalized error (257.0119ms)
✔ evaluateReliability flags insufficient_data below min samples (0.7779ms)
✔ failure window key is stable for the same summary (idempotency basis) (1.133ms)
✔ decideRouteModel promotes fallback when degradation threshold is exceeded (0.2926ms)
✔ task quality guard accepts valid payload (0.8071ms)
✔ task quality guard rejects missing rollback and bounded output (0.2206ms)
✔ under limit stays single chunk (0.9875ms)
✔ exactly at limit stays single chunk (0.2016ms)
✔ over limit chunks safely (0.5382ms)
✔ multi chunk ordering is preserved (0.2804ms)
✔ workflow lessons promotes repeated failures into bounded rules and logs injection telemetry (17.9679ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 424.5986
```

### 5) npm run check:adapters
```text
> mission-control@1.0.0 check:adapters
> node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types ./scripts/check-adapters.ts

{
  "check": "adapters",
  "passed": 5,
  "failed": 0,
  "checks": [
    {
      "name": "n8n-valid",
      "ok": true
    },
    {
      "name": "n8n-invalid-input",
      "ok": true
    },
    {
      "name": "codegraph-valid",
      "ok": true
    },
    {
      "name": "external-runner-timeout",
      "ok": true
    },
    {
      "name": "external-runner-retry-exhausted",
      "ok": true
    }
  ]
}
```

### 6) npm run check:canary-health
```text
> mission-control@1.0.0 check:canary-health
> tsx ./scripts/check-canary-health.ts

{
  "ok": true,
  "reportPath": "C:\\Users\\User\\.openclaw\\workspace\\mission-control\\reports\\ops\\canary-latest.json",
  "generatedAt": "2026-03-15T16:09:41.409Z",
  "stale": false,
  "maxAgeHours": 30,
  "failedCriticalCount": 0,
  "checks": [
    {
      "id": "eval-guard",
      "command": "npm run check:agent-evals",
      "critical": true,
      "ok": true,
      "exitCode": 0
    },
    {
      "id": "adapters",
      "command": "npm run check:adapters",
      "critical": true,
      "ok": true,
      "exitCode": 0
    },
    {
      "id": "ui-smoke",
      "command": "npm run check:ui-smoke",
      "critical": true,
      "ok": true,
      "exitCode": 0
    },
    {
      "id": "reliability-thresholds",
      "command": "npm run check:reliability",
      "critical": true,
      "ok": true,
      "exitCode": 0
    }
  ]
}
```

### 7) run lifecycle smoke (create/list/close)
```json
{
  "created": "55a6c726-c58d-44f2-b9bd-b0eff7f3295c",
  "worktree": "C:\\Users\\User\\.openclaw\\workspace\\mission-control\\.openclaw\\runs\\main-a3311b68",
  "listed": [
    {
      "id": "55a6c726-c58d-44f2-b9bd-b0eff7f3295c",
      "status": "active",
      "branch": "main"
    }
  ],
  "closed": {
    "id": "55a6c726-c58d-44f2-b9bd-b0eff7f3295c",
    "status": "closed"
  }
}
```

## 4) PASS/FAIL per command
- `npm run typecheck` → PASS
- `npm run lint` → PASS
- `npm run build` → PASS
- `npm test` → PASS
- `npm run check:adapters` → PASS
- `npm run check:canary-health` → PASS
- run lifecycle smoke (create/list/close) → PASS

## 5) Final verdict
BLOCKED

## 6) If BLOCKED: smallest concrete fix
Run one live API dispatch against `/api/agents/[id]/dispatch` with an actual `agent-orchestrator` agent and `runId` to complete end-to-end acceptance for “dispatch one task against that run” in this environment.
