# Tool Admission Rubric

This policy is used to decide whether a candidate capability is promoted into Directive Forge use inside the Mission Control host.

## Decision rule

- Run one bounded spike per tool (max 1 day).
- Score three outcomes against baseline:
  - quality
  - token cost
  - failure rate
- Integrate only if at least **2 of 3** outcomes pass thresholds and hard guards pass.

## Default thresholds

- `quality`: candidate must be at least `+3%` vs baseline.
- `token cost`: candidate must be at least `-8%` vs baseline.
- `failure rate`: candidate must be at least `-10%` vs baseline.

Hard guards:

- quality floor: `>= 0.70`
- failure ceiling: `<= 0.25`

## Hard stop

- If two consecutive tools fail admission, stop integrating new tools and optimize the current stack.

## Input payload

Create `reports/tool-admission/latest.json`:

```json
{
  "tool": "agent-orchestrator",
  "baseline": {
    "quality_score": 0.81,
    "token_cost_per_run": 11800,
    "failure_rate": 0.12
  },
  "candidate": {
    "quality_score": 0.86,
    "token_cost_per_run": 10100,
    "failure_rate": 0.09
  },
  "context": {
    "sample_runs": 30,
    "notes": "Bounded spike with workflow chaining enabled."
  }
}
```

## Run checker

```bash
npm run check:tool-admission
```

Optional explicit input file:

```bash
node --experimental-strip-types ./scripts/check-tool-admission.ts ./reports/tool-admission/agent-orchestrator.json
```

## Environment knobs

Use `.env` or CI environment variables:

- `MISSION_CONTROL_TOOL_ADMISSION_REQUIRED_WINS` (default `2`)
- `MISSION_CONTROL_TOOL_ADMISSION_MIN_QUALITY_GAIN` (default `0.03`)
- `MISSION_CONTROL_TOOL_ADMISSION_MIN_COST_REDUCTION` (default `0.08`)
- `MISSION_CONTROL_TOOL_ADMISSION_MIN_FAILURE_REDUCTION` (default `0.10`)
- `MISSION_CONTROL_TOOL_ADMISSION_HARD_QUALITY_FLOOR` (default `0.70`)
- `MISSION_CONTROL_TOOL_ADMISSION_HARD_FAILURE_CEILING` (default `0.25`)

## Output contract

The checker prints JSON:

- `ok`
- `recommendation` (`integrate` | `iterate` | `reject`)
- `wins` and `required_wins`
- `metrics.deltas`
- per-check pass/fail

Exit code:

- `0` when admitted (`ok=true`)
- non-zero when blocked (`ok=false`)
