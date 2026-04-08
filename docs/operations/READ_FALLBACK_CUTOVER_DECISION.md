# Read Fallback Cutover Decision

**Decision date:** 2026-03-18
**Status:** KEEP read fallback through cutover; remove after 7-day stable runway

## Context

Three API surface groups (quests, docs, reports) have a read fallback pattern:
when the Nest backend returns HTTP 502, the BFF layer serves data from local
Drizzle/SQLite instead. This keeps the dashboard readable during backend downtime.

All other API groups (notes, views, agents, automation, directive-workspace,
projects, ops, workspace, code-graph, context, workflow) are pure backend proxy
with no local fallback.

## Decision

**KEEP** the read fallback for quests, docs, and reports during the cutover runway.

## Rationale

1. The fallback has zero write-path risk — writes already fail-fast with
   `code: backend_required_for_write` when the backend is down.
2. Removing fallback before the backend has a 7-day consecutive green ops-stack
   record would create an unnecessary availability regression.
3. The fallback code is small, isolated (3 route files), and well-tested by
   `check:core-api-contracts`.

## Removal conditions

Remove the read fallback when ALL of the following are true:

1. `check:cutover-runway` reports `ok: true` (7 consecutive green ops-stack days).
2. Backend uptime is reliable enough that 502 fallback is not exercised in
   normal operations.
3. The legacy removal matrix shows quests/docs/reports as `removal-ready: true`.

## Removal steps

1. In each route file, delete the `if (response.status === 502)` fallback branch.
2. Remove local repository imports that become unused.
3. Run `check:core-api-contracts` — update the `fallback-read-quests-docs-reports`
   check to verify fallback is gone (or remove that test).
4. Run full ops-stack to confirm no regressions.

## Rollback path

If removing fallback causes dashboard read failures:

1. Revert the route file changes (git revert or restore from backup).
2. Investigate backend availability root cause.
3. Re-add fallback if backend stability regresses.

## Affected files

- `src/app/api/quests/route.ts` (GET fallback to `listQuests()`)
- `src/app/api/docs/route.ts` (GET fallback to `listDocs()` / `searchDocs()`)
- `src/app/api/reports/route.ts` (GET fallback to `listReports()` / `countReports()`)
