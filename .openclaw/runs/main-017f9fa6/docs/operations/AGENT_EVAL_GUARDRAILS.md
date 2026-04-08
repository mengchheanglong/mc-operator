# Agent Eval Guardrails

## Purpose
Use Promptfoo-based bounded evals to score task outputs for quality + cost before promotion and before live runtime dispatch.

## Commands

```bash
npm run eval:agents
npm run check:agent-evals
npm run check:agent-eval-regression
```

Artifacts:
- `reports/evals/promptfoo-raw.json`
- `reports/evals/latest.json`
- `reports/evals/latest-summary.md`
- `reports/evals/eval-*.json`

## Pass / fail rules
`check:agent-evals` fails if any condition is violated:

- `score < MISSION_CONTROL_EVAL_MIN_SCORE` (default `0.8`)
- `costUsd > MISSION_CONTROL_EVAL_MAX_COST_USD` (default `0.50`)
- `failureRate > MISSION_CONTROL_EVAL_MAX_FAILURE_RATE` (default `0.15`)

`check:agent-eval-regression` fails if recent eval history shows regression across the latest two windows:
- average score drops beyond `MISSION_CONTROL_EVAL_REGRESSION_SCORE_DROP_TOLERANCE`
- average failure rate rises beyond `MISSION_CONTROL_EVAL_REGRESSION_FAILURE_RISE_TOLERANCE`

## Runtime blocking policy
Runtime dispatch/execute routes read `reports/evals/latest.json` through the shared eval-guard service.

Statuses:
- `healthy`: allow execution normally
- `degraded`: allow execution, include warning in response payload, append report entry
- `blocked`: return `409` with code `blocked_by_eval_guardrail`, include guard snapshot + reasons, do not dispatch downstream work, append report entry
- `unavailable`: allow execution, include `eval_guard_unavailable` warning, append report entry

Guard thresholds:
- `MISSION_CONTROL_EVAL_MIN_SCORE`
- `MISSION_CONTROL_EVAL_MAX_COST_USD`
- `MISSION_CONTROL_EVAL_MAX_FAILURE_RATE`

Near-threshold degraded margins:
- `MISSION_CONTROL_EVAL_DEGRADED_SCORE_MARGIN`
- `MISSION_CONTROL_EVAL_DEGRADED_COST_USD_MARGIN`
- `MISSION_CONTROL_EVAL_DEGRADED_FAILURE_RATE_MARGIN`

## Promotion gate policy
Only promote agent/automation output when both pass:
1. workflow verification gates (typecheck/lint/build/check scripts)
2. agent eval guardrails (`eval:agents` + `check:agent-evals` + regression check when history exists)

If eval checks fail, keep the change in iterate mode and fix the smallest failing rubric dimension first.

## Degraded / unavailable behavior
- Degraded means the latest eval is still above the hard block threshold but close enough to require caution.
- Unavailable means the artifact is missing or malformed; runtime continues without crashing, but the response and reports must carry the warning so operators can fix coverage before promotion.

## Rollback guidance
If the guard begins blocking production unexpectedly:
1. rerun `npm run eval:agents`
2. inspect `reports/evals/latest.json`
3. if the artifact is malformed or stale, regenerate it before changing thresholds
4. if thresholds are genuinely too strict, adjust env values narrowly and document why
5. if needed, temporarily remove only the route-level enforcement patch and keep the reporting/status UI intact until eval quality is restored
