# Workspace Portfolio Structure

## Target layout

- `C:\Users\User\.openclaw\workspace\mc-operator`
  - Control plane only (dispatch, reports, automation APIs).
- `C:\Users\User\.openclaw\workspace\directive-workspace`
  - Product-owned Directive Discovery / Forge / Architecture surfaces.
- `C:\Users\User\.openclaw\workspace\studyspace`
  - Research and bounded experiments.
- `C:\Users\User\.openclaw\workspace\venturespace\projects\<project-name>`
  - Product repos.
- `C:\Users\User\.openclaw\workspace\mc-operator\projects\<project-name>`
  - Optional local child projects for mc-operator-owned prototypes.
- `C:\Users\User\.openclaw\workspace\agent-lab`
  - Retired historical source catalog kept for reference and extraction history only.

## Scope policy

- Per-task tool execution must target the active run worktree only.
- Fast scans may target `src` inside that run, but not the full workspace.
- Workspace/global health checks run on nightly schedule only.

## Nightly command

- `npm run ops:workspace-health-nightly`

This command writes:
- `reports/ops/workspace-global-health-latest.json`
- `reports/ops/workspace-global-health-<timestamp>.json`
