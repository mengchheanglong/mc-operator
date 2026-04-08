# Ops Health Gates

## Purpose
Provide explicit, scriptable health gates for operational reports so readiness checks fail fast on stale/broken ops state.

## Commands
- `npm run check:repo-sources-health`
- `npm run check:workspace-health-nightly`
- `npm run check:canary-health`
- `npm run check:nightly-ops`
- `npm run check:nightly-trend-health`
- `npm run check:nightly-step-hotspots`
- `npm run check:nightly-hotspot-report-health`
- `npm run check:nightly-hotspot-summary-health`
- `npm run check:nightly-hotspot-alert-feed-health`
- `npm run check:nightly-hotspot-followup-health`
- `npm run check:nightly-summary-health`
- `npm run check:nightly-repeat-failures`
- `npm run check:ops-health`
- `npm run check:ops-stack`
- `npm run check:orchestrator-readiness`

## What each gate enforces
### `check:repo-sources-health`
- Reads `reports/ops/repo-sync-latest.json`
- Fails if report missing, stale, or `summary.blocked > 0`
- Max age env override: `MISSION_CONTROL_REPO_SOURCES_MAX_AGE_HOURS` (default 24)

### `check:workspace-health-nightly`
- Reads `reports/ops/workspace-global-health-latest.json`
- Fails if missing/stale or report indicates incomplete runtime/project pass counts
- Max age env override: `MISSION_CONTROL_WORKSPACE_HEALTH_MAX_AGE_HOURS` (default 30)

### `check:nightly-ops`
- Reads `reports/ops/nightly-ops-bundle-latest.json`
- Requires all expected steps present and successful
- Requires `stepOrderVersion >= 2`
- Requires `ops_health_snapshot` as the final step
- Requires `stepTimeline` length matches step count
- Max age env override: `MISSION_CONTROL_NIGHTLY_MAX_AGE_HOURS` (default 30)

### `check:nightly-summary-health`
- Reads `reports/ops/nightly-ops-summary-latest.md`
- Fails if summary missing, stale, or malformed
- Max age env override: `MISSION_CONTROL_NIGHTLY_SUMMARY_MAX_AGE_HOURS` (default 30)

### `check:nightly-trend-health`
- Reads latest timestamped nightly bundle trend (default last 8 runs)
- Evaluates risk on:
  - failing ratio over window
  - latest duration spike vs median prior duration
- Env knobs:
  - `MISSION_CONTROL_NIGHTLY_TREND_LIMIT` (default 8)
  - `MISSION_CONTROL_NIGHTLY_MAX_FAILING_RATIO` (default 0.4)
  - `MISSION_CONTROL_NIGHTLY_MAX_DURATION_SPIKE_RATIO` (default 1.75)
  - `MISSION_CONTROL_NIGHTLY_MIN_RECOVERY_STREAK` (default 3)
  - Note: if latest healthy streak meets `MIN_RECOVERY_STREAK`, historical failing-ratio alerts are suppressed.

### `check:nightly-step-hotspots`
- Scans recent nightly bundle runs and computes per-step hotspots (failure rate, slow-run pressure, duration spike)
- Fails when flagged hotspot count exceeds threshold
- Env knobs:
  - `MISSION_CONTROL_NIGHTLY_HOTSPOT_LIMIT` (default 8)
  - `MISSION_CONTROL_NIGHTLY_HOTSPOT_MIN_SAMPLES` (default 3)
  - `MISSION_CONTROL_NIGHTLY_HOTSPOT_MAX_FAILURE_RATE` (default 0.35)
  - `MISSION_CONTROL_NIGHTLY_HOTSPOT_SLOW_DURATION_MS` (default 180000)
  - `MISSION_CONTROL_NIGHTLY_HOTSPOT_MAX_SLOW_RUNS` (default 3)
  - `MISSION_CONTROL_NIGHTLY_HOTSPOT_MAX_DURATION_SPIKE_RATIO` (default 2)
  - `MISSION_CONTROL_NIGHTLY_HOTSPOT_MIN_FAILING_STREAK` (default 2)
  - `MISSION_CONTROL_NIGHTLY_HOTSPOT_MIN_SLOW_STREAK` (default 2)
  - `MISSION_CONTROL_NIGHTLY_HOTSPOT_MAX_FLAGGED_STEPS` (default 0)

### `check:nightly-hotspot-report-health`
- Reads `reports/ops/nightly-step-hotspots-latest.json`
- Fails if report missing, stale, empty (`totalSteps=0`), or `ok !== true`
- Max age env override: `MISSION_CONTROL_NIGHTLY_HOTSPOT_REPORT_MAX_AGE_HOURS` (default 30)

### `check:nightly-hotspot-summary-health`
- Reads `reports/ops/nightly-step-hotspots-summary-latest.md`
- Fails if summary missing, stale, or malformed
- Max age env override: `MISSION_CONTROL_NIGHTLY_HOTSPOT_SUMMARY_MAX_AGE_HOURS` (default 30)

### `check:nightly-hotspot-alert-feed-health`
- Reads `reports/ops/nightly-step-hotspots-alerts-latest.json`
- Fails if alert feed missing or stale
- Optional strict mode: set `MISSION_CONTROL_NIGHTLY_HOTSPOT_ALERT_FAIL_ON_HIGH=true` to fail when high severity alerts exist
- Max age env override: `MISSION_CONTROL_NIGHTLY_HOTSPOT_ALERT_FEED_MAX_AGE_HOURS` (default 30)

### `check:nightly-hotspot-followup-health`
- Reads `reports/ops/nightly-step-hotspots-followup-latest.json`
- Fails if follow-up artifact missing/stale or quest follow-up payload is missing
- Max age env override: `MISSION_CONTROL_NIGHTLY_HOTSPOT_FOLLOWUP_MAX_AGE_HOURS` (default 30)

### `check:nightly-repeat-failures`
- Scans recent nightly bundle runs for repeated failures on the same step
- Fails when any step fails `threshold` times within configured window
- Env knobs:
  - `MISSION_CONTROL_REPEAT_FAILURE_WINDOW` (default 8)
  - `MISSION_CONTROL_REPEAT_FAILURE_THRESHOLD` (default 3)

### `check:ops-health`
- Reads `reports/ops/ops-health-latest.json`
- Requires all aggregated items healthy (`repoSources`, `canary`, `workspaceHealth`, `nightlyBundle`)
- Max age env override: `MISSION_CONTROL_OPS_HEALTH_MAX_AGE_HOURS` (default 30)

### `check:ops-stack`
- Runs the full ops gate chain in one command:
  1. `check:repo-sources-health`
  2. `check:workspace-health-nightly`
  3. `check:canary-health`
  4. `check:nightly-ops`
  5. `check:nightly-trend-health`
  6. `check:nightly-step-hotspots`
  7. `check:nightly-hotspot-report-health`
  8. `check:nightly-hotspot-summary-health`
  9. `check:nightly-hotspot-alert-feed-health`
  10. `check:nightly-hotspot-followup-health`
  11. `check:nightly-summary-health`
  12. `check:nightly-repeat-failures`
  13. `check:ops-health`
- Returns non-zero on first/any failing gate.

## API surfaces
- `GET /api/ops/nightly`: nightly status snapshot
- `GET /api/ops/nightly?view=failing`: failing-only nightly status items
- `GET /api/ops/nightly?view=timeline`: latest bundle step/timeline payload
- `GET /api/ops/nightly?view=trend&limit=8`: recent nightly bundle trend points
- `GET /api/ops/nightly?view=summary`: parsed latest nightly markdown summary metadata
- `GET /api/ops/nightly?view=hotspots&limit=8`: per-step hotspot risk scan
- `GET /api/ops/nightly?view=hotspot-report`: latest persisted hotspot report
- `GET /api/ops/nightly?view=hotspot-trend&limit=8`: recent hotspot report trend
- `GET /api/ops/nightly?view=hotspot-summary`: parsed hotspot markdown summary metadata
- `GET /api/ops/nightly?view=hotspot-alerts`: latest hotspot alert feed
- `GET /api/ops/nightly?view=hotspot-followup`: latest hotspot follow-up payload (quest action + cooldown)

Drilldown:
- `GET /api/ops/nightly?view=hotspots&step=<stepId>`
- `GET /api/ops/nightly?view=hotspot-report&step=<stepId>`
- `GET /api/ops/nightly?view=hotspots&flaggedOnly=true&minSeverity=high`
- `GET /api/ops/health`: aggregated ops-health snapshot across repo-sources/canary/workspace/nightly bundle
- `GET /api/ops/health?view=failing`: failing-only ops-health entries

## Snapshot generation
- `npm run ops:health:snapshot` writes:
  - `reports/ops/ops-health-latest.json`
  - `reports/ops/ops-health-<timestamp>.json`
- `npm run ops:nightly:summary` writes:
  - `reports/ops/nightly-ops-summary-latest.md`
  - `reports/ops/nightly-ops-summary-<timestamp>.md`
- `npm run ops:report:prune` removes old timestamped ops artifacts (latest files are always preserved)
  - Also covers high-churn task automation artifacts such as:
    - `directive-integration-proof-*.md`
    - `directive-lifecycle-proof-*.md`
    - `desloppify-prototype-*.md`
    - `tooling-audit-*.md`
    - `agency-agents-*.md`
    - `tool-admission-*.json`
  - Retention env: `MISSION_CONTROL_OPS_REPORT_RETENTION_DAYS` (default 14)

## Nightly bundle metadata
- `reports/ops/nightly-ops-bundle-*.json` now includes:
  - `stepOrderVersion`
  - `stepTimeline[]` with `startedOffsetMs` and `finishedOffsetMs`
- `ops_health_snapshot` is expected to be the final step in bundle execution order.
- `ops:report:prune` runs after the nightly summaries/hotspots/follow-up steps so pruning never removes reports before they are written.

## Internal guardrail
- Nightly jobs invoke readiness with `MISSION_CONTROL_READINESS_SKIP_NIGHTLY_GATES=true` to avoid circular gating between readiness and nightly artifact checks.
- Normal readiness path uses `npm run check:ops-stack` as the single aggregated ops gate.
