# Nightly Ops Scheduler

## Goal
Run one command nightly to refresh repo-source health, workspace health, canary status, and orchestrator readiness.

## Bundle Command
- `npm run ops:nightly`
- `npm run check:nightly-ops` (health gate for latest nightly bundle artifact)
- `npm run ops:nightly:hotspots` (persists hotspot artifact)
- `npm run ops:nightly:hotspots:summary` (persists hotspot markdown summary)
- `npm run ops:nightly:hotspots:alerts` (persists hotspot alert feed)
- `npm run ops:nightly:hotspots:followup` (opens/reuses runtime-reliability quest + report with cooldown/dedupe)

This command runs:
1. `npm run ops:repo-sources:nightly`
2. `npm run canary:nightly`
3. `npm run ops:workspace-health-nightly`
4. `npm run ops:orchestrator-nightly`
5. `npm run ops:health:snapshot`

Note:
- Nightly bundle runs canary with `MISSION_CONTROL_RELIABILITY_SOFT_MODE=true` to avoid false negatives when reliability sample size is below threshold.
- Bundle report is written before and after `ops:health:snapshot` so the snapshot reads the current run's latest bundle state.
- Bundle output includes `stepTimeline` offsets and expects `ops_health_snapshot` as final step.
- Nightly also writes markdown summary (`ops:nightly:summary`) and prunes old ops artifacts (`ops:report:prune`).

It writes:
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-ops-bundle-latest.json`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-ops-bundle-<timestamp>.json`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-ops-summary-latest.md`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-ops-summary-<timestamp>.md`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-step-hotspots-latest.json`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-step-hotspots-<timestamp>.json`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-step-hotspots-summary-latest.md`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-step-hotspots-summary-<timestamp>.md`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-step-hotspots-alerts-latest.json`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-step-hotspots-alerts-<timestamp>.json`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-step-hotspots-followup-latest.json`
- `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\nightly-step-hotspots-followup-<timestamp>.json`

Concurrency guard:
- `ops:nightly` uses `reports/ops/nightly-ops-bundle.lock` and skips duplicate overlapping runs.

API debug views:
- `GET /api/ops/nightly?view=failing`
- `GET /api/ops/nightly?view=timeline`
- `GET /api/ops/nightly?view=trend&limit=8`
- `GET /api/ops/nightly?view=summary`
- `GET /api/ops/nightly?view=hotspots&limit=8`
- `GET /api/ops/nightly?view=hotspot-report`
- `GET /api/ops/nightly?view=hotspot-trend&limit=8`
- `GET /api/ops/nightly?view=hotspot-summary`
- `GET /api/ops/nightly?view=hotspot-alerts`
- `GET /api/ops/nightly?view=hotspot-followup`
- `GET /api/ops/nightly?view=hotspots&step=<stepId>`
- `GET /api/ops/nightly?view=hotspot-report&step=<stepId>`
- `GET /api/ops/nightly?view=hotspots&flaggedOnly=true&minSeverity=high`

## Windows Task Scheduler Setup
Use the setup helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-nightly-ops-task.ps1 -TaskName "MissionControl Nightly Ops" -StartTime "22:30"
```

Recommended start time: `22:30` local time (Asia/Bangkok) to finish before typical midnight shutdown.

## Manual Verification
Run:

```powershell
npm run ops:nightly
Get-Content .\reports\ops\nightly-ops-bundle-latest.json
```

## Failure Handling
- If bundle fails, inspect per-step `stdout`/`stderr` inside `nightly-ops-bundle-latest.json`.
- Check summary health: `npm run check:nightly-summary-health`.
- Check trend health: `npm run check:nightly-trend-health`.
- Check step hotspots: `npm run check:nightly-step-hotspots`.
- Check hotspot report artifact: `npm run check:nightly-hotspot-report-health`.
- Check hotspot summary artifact: `npm run check:nightly-hotspot-summary-health`.
- Check hotspot alert feed: `npm run check:nightly-hotspot-alert-feed-health`.
- Check hotspot follow-up artifact: `npm run check:nightly-hotspot-followup-health`.
- Check repeated failures: `npm run check:nightly-repeat-failures`.
- For repo-source failures, use dashboard `Repo Sources` actions (`Retry`, `Update`, `Untrack`, `Disable`).
- For canary/reliability failures, inspect `reports/ops/canary-latest.json`.
