# Tool Admission Guardrails

This guardrail defines the deterministic admission pipeline for candidate tools from `agent-lab` into Mission Control/OpenClaw workflows.

## Command

```bash
npm run check:tool-admission
```

## What the pipeline enforces

1. Scores every tool against a fixed rubric (0-10 per criterion):
   - workflow fit
   - integration complexity
   - runtime reliability
   - maintenance burden
   - cost/token impact
   - measurable productivity gain
2. Produces a deterministic machine-readable report:
   - `reports/tool-admission/latest.json`
   - `reports/tool-admission/tool-admission-<timestamp>.json`
3. Assigns exactly one status per tool:
   - `promote`
   - `park`
   - `defer`
4. Requires explicit metadata per tool:
   - numeric score
   - reason
   - next action
5. Syncs report-driven generated blocks into:
   - `../agent-lab/PROJECT_CLASSIFICATION.md`
   - `../agent-lab/tooling-parked/MANIFEST.md`

## Status policy

- `promote`: score >= 75 and no hard guard miss.
- `park`: score 55-74 with no hard guard miss.
- `defer`: score < 55 or hard guard miss (`workflowFit < 4` or `runtimeReliability < 4`).

## Determinism constraints

- Tool catalog order is normalized before scoring.
- JSON output is key-sorted recursively.
- Score rounding is fixed to two decimals.
- No random or time-based branching in score logic.

## Update discipline

- Edit tool inputs in `scripts/tool-admission/catalog.ts`.
- Edit weights/threshold logic in `scripts/tool-admission/rubric.ts`.
- Do not manually edit generated doc blocks between:
  - `<!-- TOOL_ADMISSION:START -->`
  - `<!-- TOOL_ADMISSION:END -->`
