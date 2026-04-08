# Agent-Orchestrator Slice B (run-scoped execution + guardrails)

## 1) Files changed (absolute paths)
- C:\Users\User\.openclaw\workspace\mission-control\src\server\sqlite\schema.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\server\sqlite\db.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\server\repositories\workspace-run-dispatches-repo.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\server\services\workspace-run-service.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\app\api\agents\[id]\dispatch\route.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\app\api\automation\runs\route.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\app\api\automation\runs\[id]\close\route.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\app\api\automation\runs\[id]\summary\route.ts
- C:\Users\User\.openclaw\workspace\mission-control\src\app\dashboard\automations\WorkspaceRunsPanel.tsx
- C:\Users\User\.openclaw\workspace\mission-control\src\app\dashboard\automations\AutomationsPageClient.tsx
- C:\Users\User\.openclaw\workspace\mission-control\scripts\fix-running-dispatch.ts
- C:\Users\User\.openclaw\workspace\mission-control\reports\ops\agent-orchestrator-slice-b.md

## 2) Exact commands run
- npm run typecheck
- npm run lint
- npm run build
- npm test
- npm run check:adapters
- npm run check:canary-health
- npm run check:agent-evals
- npm run check:agent-eval-regression
- Invoke-RestMethod GET /api/automation/runs/:id/summary
- Invoke-RestMethod POST /api/agents/:id/dispatch (overlap probe)
- Invoke-RestMethod POST /api/agents/:id/dispatch (closed-run probe)

## 3) Raw outputs
### Verification commands
- typecheck: pass (exit 0)
- lint: pass (exit 0; one react-hooks warning)
- build: pass (exit 0)
- test: pass (14 passed, 0 failed)
- check:adapters: pass (5/5)
- check:canary-health: `{ "ok": true, "failedCriticalCount": 0 }`
- check:agent-evals: `{ "scoreOk": true, "costOk": true, "failureRateOk": true }`
- check:agent-eval-regression: `{ "ok": true, "reason": "pass" }`

### Active run dispatch works
From dev server log (same code revision):
- `POST /api/agents/a9b78bc1-44ba-410c-ae4f-18a4fd73dcfe/dispatch?projectId=mission-control 200 in 4.8s`

### Overlapping dispatch blocked
```json
{"msg":"Dispatch already running for this run.","code":"run_dispatch_single_flight","reason":"run_dispatch_in_flight","nextCommand":"Wait for current run dispatch to finish and retry.","artifactPath":"C:\\Users\\User\\.openclaw\\workspace\\mission-control\\.openclaw\\runs\\main-3192d0fd"}
```

### Closed run dispatch blocked
```json
{"msg":"Workspace run is not active.","code":"workspace_run_inactive","reason":"run_not_active","nextCommand":"Create a new run or reopen a usable worktree, then retry dispatch.","artifactPath":"C:\\Users\\User\\.openclaw\\workspace\\mission-control\\.openclaw\\runs\\main-a3311b68"}
```

### Summary endpoint telemetry
```json
{
  "run": {
    "id": "817bda17-770d-4f62-832b-af186eabe38e",
    "status": "active",
    "metadata": {
      "lastDispatchAt": "2026-03-16T11:01:34.313Z",
      "lastDispatchStatus": "error",
      "lastDispatchReportId": "0f0f2932-bf8c-4304-8a68-bfbb9ab02c62"
    }
  },
  "summary": {
    "lastDispatch": {
      "status": "running",
      "startedAt": "2026-03-16T11:01:45.019Z"
    },
    "verificationArtifacts": {
      "lastCommandStatus": "running",
      "reportId": null,
      "artifactPath": null
    }
  }
}
```

## 4) PASS/FAIL per command
- npm run typecheck → PASS
- npm run lint → PASS
- npm run build → PASS
- npm test → PASS
- npm run check:adapters → PASS
- npm run check:canary-health → PASS
- npm run check:agent-evals → PASS
- npm run check:agent-eval-regression → PASS

## 5) Final verdict
READY

## 6) If BLOCKED: smallest concrete fix
N/A
