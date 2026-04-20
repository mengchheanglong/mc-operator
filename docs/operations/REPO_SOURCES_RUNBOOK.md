# Repo Sources Operations Runbook

## Purpose
`repo-sources` is the workspace-level registry and health gate for external repos that Mission Control depends on.  
It prevents agent dispatch when tracked repos are stale/blocked and gives operators a safe recovery path.

## Registry
- File: `C:\Users\User\.openclaw\workspace\repo-sources.json`
- Each entry supports:
  - `path`: repo location (relative to workspace root or absolute)
  - `enabled`: include/exclude repo from checks
  - `track`: whether updates/checking should run for this repo
  - `allowDirty`: allow dirty working tree without blocking

## Core Commands
- Check tracked repos (fetch + report):
  - `npm run ops:repo-sources:check -- --fetch`
- Apply fast-forward updates:
  - `npm run ops:repo-sources:update`
- Nightly reliability pass + quest dedupe:
  - `npm run ops:repo-sources:nightly`

## Reports and State
- Latest sync: `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\repo-sync-latest.json`
- Nightly latest: `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\repo-sources-nightly-latest.json`
- Nightly dedupe state: `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\repo-sources-nightly-state.json`
- Operation lock: `C:\Users\User\.openclaw\workspace\mc-operator\reports\ops\repo-sources-op.lock`

## Dispatch Gate Behavior
Agent dispatch blocks when:
- sync report missing (`repo_sources_unavailable`)
- sync report stale (`repo_sources_stale`, default max age: 24h)
- blocked repos exist (`repo_sources_blocked`)

Clear blocked state before retrying dispatch.

## Dashboard Operations
From Dashboard -> Repo Sources:
- `Retry Sync Now`: re-check all tracked repos
- `Update Repos`: apply update pass for all tracked repos
- Per blocked repo:
  - `Retry This`
  - `Update This`
  - `Untrack` (`track=false`)
  - `Disable` (`enabled=false`)

All operations write maintenance reports.

## Standard Recovery Flow
1. Open blocked repo list: `GET /api/ops/repo-sources?view=blocked`
2. For each blocked repo:
   - if temporary failure: retry check/update
   - if no longer in use: untrack or disable
   - if repo path invalid: fix `repo-sources.json` path
3. Re-run:
   - `npm run ops:repo-sources:check -- --fetch`
   - `npm run check:orchestrator-readiness`

## Operator Notes
- Single-repo operations are supported through API and do not require a full workspace update pass.
- Locking prevents concurrent repo-source operations from clobbering reports.
- Nightly quest creation is deduplicated by blocked-entry signature to avoid alert spam.
