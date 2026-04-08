# OpenClaw Autonomous Improvement Loop

Use this pattern when OpenClaw should improve a project without wandering across the whole repo.

## Core Idea

The automation is not "work forever on anything." It is:

1. pick one small bounded improvement
2. change only the narrowest useful surface
3. run a fixed verification loop
4. keep the result only if it clearly improves the project
5. record the outcome in Mission Control

## Good Targets

- one UI cleanup
- one docs drift fix
- one quest topic backfill
- one small refactor
- one failing check or obvious bug

## Bad Targets

- broad architectural rewrites
- multi-area redesigns
- open-ended "improve the whole app"
- changes with no clear verification step

## Guardrails

- Keep the edit surface intentionally small.
- Prefer one file or one tightly related cluster of files.
- Use the project's normal verification commands.
- If the result is neutral, risky, or fails verification, discard the idea.
- Always return a short keep-or-discard summary.

## Recommended Prompt Shape

```text
Pick one small, well-bounded improvement in the current project.

Constraints
- Keep the edit surface narrow.
- Avoid broad restructuring.
- Verify with the project's normal checks.
- If the change does not clearly improve the project or fails verification, discard it.

Output
- What was attempted
- Files touched
- Verification result
- Keep, retry differently, or drop
```

## Mission Control Role

- `Automations` stores the reusable task template.
- `OpenClaw` performs the improvement loop.
- `Reports` records the result.
- `Quests` gets a follow-up only if more work is genuinely needed.
