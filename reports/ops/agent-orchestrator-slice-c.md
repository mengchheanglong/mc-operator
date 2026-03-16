# Agent-Orchestrator Slice C (promotion readiness + nightly ops checks)

## 1) Files changed (absolute paths)
- C:\Users\User\.openclaw\workspace\mission-control\package.json
- C:\Users\User\.openclaw\workspace\mission-control\src\server\sqlite\schema.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\server\sqlite\db.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\server\repositories\orchestrator-reliability-repo.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\server\services\workspace-run-service.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\app\api\agents\[id]\dispatch\route.ts
- C:\Users\User\.openclaw\workspace\mission-control\scripts\summarize-orchestrator-reliability.ts
- C:\Users\User\.openclaw\workspace\mission-control\scripts\check-orchestrator-readiness.ts
- C:\Users\User\.openclaw\workspace\mission-control\scripts\run-orchestrator-nightly-ops.ts
- C:\Users\User\.openclaw\workspace\mission-control\docs\operations\AGENT_ORCHESTRATOR_PROMOTION_READINESS.md
- C:\Users\User\.openclaw\workspace\mission-control\reports\ops\agent-orchestrator-slice-c.md

## 2) Exact commands run
- npm run typecheck
- npm run lint
- npm run build
- npm test
- npm run check:adapters
- npm run check:ui-smoke
- npm run check:canary-health
- npm run check:agent-evals
- npm run check:agent-eval-regression
- npm run reliability:orchestrator
- npm run check:orchestrator-readiness
- npm run ops:orchestrator-nightly

## 3) Raw outputs
### npm run typecheck
```text
> mission-control@1.0.0 typecheck
> tsc --noEmit --project tsconfig.typecheck.json --incremental false
```

### npm run lint
```text
> mission-control@1.0.0 lint
> eslint . --ext .js,.jsx,.ts,.tsx

C:\Users\User\.openclaw\workspace\mission-control\src\app\dashboard\automations\WorkspaceRunsPanel.tsx
  70:6  warning  React Hook useEffect has a missing dependency: 'refresh'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

✖ 1 problem (0 errors, 1 warning)
```

### npm run build
```text
> mission-control@1.0.0 build
> next build

▲ Next.js 16.1.6 (Turbopack)
✓ Compiled successfully
Process exited with code 0.
```

### npm test
```text
> mission-control@1.0.0 test
> node --experimental-strip-types --test ./tests/runtime/*.test.ts

ℹ pass 14
ℹ fail 0
```

### npm run check:adapters
```json
{
  "check": "adapters",
  "passed": 5,
  "failed": 0
}
```

### npm run check:ui-smoke
```text
UI smoke check passed.
Generated: 2026-03-15T14:51:18.739Z
Flows: 3 (passed=3, failed=0)
```

### npm run check:canary-health
```json
{
  "ok": true,
  "failedCriticalCount": 0
}
```

### npm run check:agent-evals
```json
{
  "scoreOk": true,
  "costOk": true,
  "failureRateOk": true,
  "score": 0.857,
  "failureRate": 0.143
}
```

### npm run check:agent-eval-regression
```json
{
  "ok": true,
  "reason": "pass",
  "delta": 0
}
```

### npm run reliability:orchestrator
```json
{
  "ok": true,
  "latestPath": "C:\\Users\\User\\.openclaw\\workspace\\mission-control\\reports\\ops\\orchestrator-reliability-latest.json",
  "datedPath": "C:\\Users\\User\\.openclaw\\workspace\\mission-control\\reports\\ops\\orchestrator-reliability-2026-03-16T12-09-02-924Z.json",
  "report": {
    "counters": {
      "create_total": 6,
      "create_success": 4,
      "dispatch_total": 0,
      "dispatch_success": 0,
      "close_total": 4,
      "close_success": 4,
      "overlap_block_count": 3,
      "stale_cleanup_count": 0
    },
    "rates": {
      "create_success_rate": 0.6667,
      "dispatch_success_rate": 1,
      "close_success_rate": 1
    }
  }
}
```

### npm run check:orchestrator-readiness
```json
{
  "ok": true,
  "checks": [
    { "command": "npm run check:agent-evals", "ok": true },
    { "command": "npm run check:agent-eval-regression", "ok": true },
    { "command": "npm run check:canary-health", "ok": true },
    { "command": "npm run check:adapters", "ok": true },
    { "command": "npm run check:ui-smoke", "ok": true }
  ],
  "gates": {
    "run_create_list_close_happy_path": {
      "ok": true,
      "error": null,
      "createdRunId": "7f38b960-5e31-48e5-b1d1-5539aec416ac"
    },
    "blocked_dispatch_on_closed_run": {
      "ok": true,
      "status": 409,
      "body": {
        "reason": "run_not_active",
        "runId": "7f38b960-5e31-48e5-b1d1-5539aec416ac"
      }
    },
    "blocked_overlapping_dispatch_on_same_run": {
      "ok": true,
      "status": 409,
      "body": {
        "reason": "run_dispatch_in_flight",
        "runId": "817bda17-770d-4f62-832b-af186eabe38e"
      }
    }
  }
}
```

### npm run ops:orchestrator-nightly
```json
{
  "ok": true,
  "latestPath": "C:\\Users\\User\\.openclaw\\workspace\\mission-control\\reports\\ops\\orchestrator-nightly-latest.json",
  "datedPath": "C:\\Users\\User\\.openclaw\\workspace\\mission-control\\reports\\ops\\orchestrator-nightly-2026-03-16T12-14-07-024Z.json"
}
```

## 4) PASS/FAIL per command
- npm run typecheck → PASS
- npm run lint → PASS
- npm run build → PASS
- npm test → PASS
- npm run check:adapters → PASS
- npm run check:ui-smoke → PASS
- npm run check:canary-health → PASS
- npm run check:agent-evals → PASS
- npm run check:agent-eval-regression → PASS
- npm run reliability:orchestrator → PASS
- npm run check:orchestrator-readiness → PASS
- npm run ops:orchestrator-nightly → PASS

## 5) Final verdict
READY

## 6) If BLOCKED: smallest concrete fix
N/A
