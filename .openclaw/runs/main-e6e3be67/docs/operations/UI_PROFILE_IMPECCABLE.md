# Impeccable UI Agent Profile

## Purpose

`impeccable-ui` is an opt-in agent profile for UI-focused tasks in the Agents surface.
It is intended for work where you need consistent UI-improvement framing in the dispatch brief.

## When to use

Use this profile when the task is primarily about:

- UX quality improvements
- layout/interaction polish
- accessibility and responsive behavior checks
- visual regression-sensitive changes

Keep the default profile for non-UI work or mixed backend/system tasks.

## What it changes

When selected, dispatch briefs add a fixed structure:

- UX issue summary
- Concrete change plan
- Verification checklist covering responsive behavior, accessibility, and visual regressions

No behavior changes are applied unless this profile is selected.

## Verification

Run:

```bash
npm run check:ui-profile
```

The check validates profile registration and isolation (default behavior unchanged).
