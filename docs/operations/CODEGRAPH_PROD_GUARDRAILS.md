# CodeGraph Production Guardrails

## Narrow production thresholds

- `indexSuccessRate >= 0.85`
- `injectionRate >= 0.80`
- Keep degraded runs minimal via fallback and strict gating.

## Two-window rollback rule

Evaluate telemetry in consecutive 10-run windows (latest 20 total):

- If `indexSuccessRate < 0.85` **OR** `injectionRate < 0.80` in **both** windows,
  status is `ROLLBACK_REQUIRED`.

## Monitor command

```bash
npm run check:codegraph-rollback
```

Exit codes:
- `0` = HEALTHY
- `2` = ROLLBACK_REQUIRED
- `1` = malformed/missing data

## Rollback env flips (iterate mode)

Set these env values and restart app:

- `MISSION_CONTROL_CODEGRAPH_BOUNDED_MODE=false`
- `MISSION_CONTROL_CODEGRAPH_STRICT_GATE_MODE=true`
- `MISSION_CONTROL_CODEGRAPH_FALLBACK_MODE=true`
- `MISSION_CONTROL_CODEGRAPH_DIAGNOSTICS_MODE=true`
- `MISSION_CONTROL_CODEGRAPH_TOKEN_DELTA_BUDGET=180`
- `MISSION_CONTROL_CODEGRAPH_INDEX_RETRIES=1`
- `MISSION_CONTROL_CODEGRAPH_STALE_CACHE_TTL_MINUTES=120`
