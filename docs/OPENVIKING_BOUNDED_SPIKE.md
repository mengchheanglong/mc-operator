# OpenViking Bounded Spike (Phase 3)

Date: 2026-03-16
Mode: one-time bounded spike (no full integration)

## Reusable patterns extracted

1. **Tiered context loading (L0/L1/L2)**
   - Keep always-on short context at L0.
   - Pull L1/L2 only on demand.
2. **Retrieval trajectory logging**
   - Persist retrieval path metadata for postmortem/debug.

## Minimal adapter/doc changes used for this spike

- Script: `scripts/run-openviking-bounded-spike.ts`
- Artifact output: `reports/spikes/openviking-bounded-spike.json`

No runtime adapter was added to production dispatch path.

## Impact snapshot (from bounded simulation)

- Token/cost delta: **-46.09% tokens** (6400 -> 3450)
- Reliability delta: **+6.82%** (0.88 -> 0.94)
- Operational complexity delta: **+7 complexity points**
  - New config keys: 4
  - New runbook steps: 2
  - New adapter touchpoint: 1

## Decision

**PARK** (pattern-only retention)

Rationale:
- Positive token/reliability signal in bounded test.
- Added maintenance/runtime complexity is not justified for current roadmap.
- Preserve patterns as docs + artifact; avoid dependency activation.

Rollback notes:
- Remove `scripts/run-openviking-bounded-spike.ts`
- Delete `reports/spikes/openviking-bounded-spike.json`
- Remove OpenViking references from policy/classification docs if decision changes.
