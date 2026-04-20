# Agent-Orchestrator Promotion Readiness

## Promotion threshold (must all pass)

1. `npm run check:orchestrator-readiness` is green.
2. `npm run check:agent-evals` and `npm run check:agent-eval-regression` are green.
3. `npm run check:canary-health`, `npm run check:adapters`, `npm run check:ui-smoke` are green.
4. Reliability summary (`reports/ops/orchestrator-reliability-latest.json`) shows:
   - `create_success_rate >= 0.95`
   - `dispatch_success_rate >= 0.90`
   - `close_success_rate >= 0.95`
   - `overlap_block_count` non-decreasing is acceptable (guardrail activity).

## Failure classes

- `run_not_active` — dispatch attempted on closed/archived run.
- `worktree_path_missing` — run worktree path missing on disk.
- `run_dispatch_in_flight` — single-flight overlap block triggered.
- `dispatch_error` — dispatch command failed.
- `timeout` — dispatch command exceeded bounded runtime.
- `stale_running_recovery` — forced cleanup of stale running dispatch lock.
- `git_worktree_add_failed` — run create failed at worktree add.
- `git_worktree_remove_failed` — run close failed at worktree remove.

## Rollback criteria

Rollback to non-run-scoped/default dispatch mode when any are true:

1. `dispatch_success_rate < 0.85` for two consecutive nightly runs.
2. `check:orchestrator-readiness` fails twice in a row.
3. `check:agent-eval-regression` fails.
4. Critical canary check (`eval-guard`, `adapters`, `ui-smoke`, `reliability`) fails.

## Manual recovery commands

Run from `C:\Users\User\.openclaw\workspace\mc-operator`.

```powershell
# 1) Generate reliability snapshot
npm run reliability:orchestrator

# 2) Full orchestrator readiness gate
npm run check:orchestrator-readiness

# 3) Force-finish a stale running dispatch lock (example helper)
npx tsx scripts/fix-running-dispatch.ts <runId>

# 4) Close stale run with explicit reason
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/automation/runs/<runId>/close?projectId=mc-operator" -ContentType 'application/json' -Body '{"archive":false,"reason":"stale"}'

# 5) Run nightly flow manually
npm run ops:orchestrator-nightly
```

## Nightly flow artifacts

- `reports/ops/orchestrator-reliability-latest.json`
- `reports/ops/orchestrator-nightly-latest.json`
- dated snapshots alongside latest files
