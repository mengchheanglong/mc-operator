# Slice A live run-targeted dispatch validation

## 1) Files changed (absolute paths)
- C:\Users\User\.openclaw\workspace\mission-control\src\app\api\agents\[id]\dispatch\route.ts
- C:\Users\User\.openclaw\workspace\mission-control\scripts\slice-a-live-dispatch-validation.ts
- C:\Users\User\.openclaw\workspace\mission-control\scripts\slice-a-linkage-proof.ts
- C:\Users\User\.openclaw\workspace\mission-control\reports\ops\slice-a-live-dispatch-validation.md

## 2) Exact commands run
1. `npm run dev`
2. `npx tsx scripts/slice-a-live-dispatch-validation.ts`
3. `npx tsx scripts/slice-a-linkage-proof.ts 817bda17-770d-4f62-832b-af186eabe38e`
4. `npm run typecheck`
5. `npm run lint`
6. `npm run build`
7. `npm run check:adapters`
8. `npm run check:canary-health`

## 3) Raw outputs
### live dispatch API call result
```json
{
  "agentId": "a9b78bc1-44ba-410c-ae4f-18a4fd73dcfe",
  "runId": "817bda17-770d-4f62-832b-af186eabe38e",
  "runStatus": "active",
  "requestPayload": {
    "task": "Validation ping: acknowledge run-scoped dispatch and respond with one-line confirmation only.",
    "runId": "817bda17-770d-4f62-832b-af186eabe38e",
    "deepMode": false
  },
  "httpStatus": 502,
  "ok": false,
  "response": {
    "msg": "Agent dispatch failed.",
    "run": {
      "reportId": "62495df5-5746-4a9d-a8c5-b5d2d1070499",
      "summary": "Dispatch failed with status 1.",
      "runContext": {
        "runId": "817bda17-770d-4f62-832b-af186eabe38e",
        "worktreePath": "C:\\Users\\User\\.openclaw\\workspace\\mission-control\\.openclaw\\runs\\main-3192d0fd",
        "status": "active"
      }
    }
  }
}
```

### persistence/linkage evidence
```json
{
  "run": {
    "id": "817bda17-770d-4f62-832b-af186eabe38e",
    "branch": "main",
    "worktree_path": "C:\\Users\\User\\.openclaw\\workspace\\mission-control\\.openclaw\\runs\\main-3192d0fd",
    "status": "active",
    "created_at": "2026-03-16T09:57:58.909Z",
    "closed_at": null
  },
  "reports": [
    {
      "id": "62495df5-5746-4a9d-a8c5-b5d2d1070499",
      "date": "2026-03-16T09:58:03.662Z",
      "title": "Agent dispatch failed: AO Live Validation Agent",
      "status": "error",
      "metadata_json_contains": {
        "runContext.runId": "817bda17-770d-4f62-832b-af186eabe38e",
        "runContext.worktreePath": "C:\\Users\\User\\.openclaw\\workspace\\mission-control\\.openclaw\\runs\\main-3192d0fd",
        "command": "node packages/cli/dist/index.js spawn ...",
        "ao_error": "No agent-orchestrator.yaml found. Run `ao init` to create one."
      }
    }
  ]
}
```

### npm run typecheck
```text
> mission-control@1.0.0 typecheck
> tsc --noEmit --project tsconfig.typecheck.json --incremental false
```

### npm run lint
```text
> mission-control@1.0.0 lint
> eslint . --ext .js,.jsx,.ts,.tsx
```

### npm run build
```text
> mission-control@1.0.0 build
> next build
...
✓ Compiled successfully
...
Process exited with code 0.
```

### npm run check:adapters
```text
{
  "check": "adapters",
  "passed": 5,
  "failed": 0
}
```

### npm run check:canary-health
```text
{
  "ok": true,
  "failedCriticalCount": 0
}
```

## 4) PASS/FAIL per command
- `npm run typecheck` → PASS
- `npm run lint` → PASS
- `npm run build` → PASS
- `npm run check:adapters` → PASS
- `npm run check:canary-health` → PASS
- Live dispatch against `/api/agents/[id]/dispatch` with valid `runId` → FAIL (HTTP 502)
- Persistence/linkage evidence query → PASS

## 5) Final verdict
BLOCKED

## 6) If BLOCKED: smallest concrete fix
Initialize/configure the Agent Orchestrator runtime in the AO tooling repo, then rerun the same live dispatch:

1. In `C:\Users\User\.openclaw\workspace\agent-lab\tooling\agent-orchestrator`, run `ao init` to create `agent-orchestrator.yaml`.
2. Retry `POST /api/agents/[id]/dispatch` with the same active `runId`.
3. Verify response `ok=true` and update Slice A verdict to READY.
