# Legacy Removal Matrix — src/app/api/*

Generated: 2026-03-18

## Summary

| Metric | Value |
|--------|-------|
| Total route groups | 18 |
| Removal-ready | 11 |
| Blocked | 7 |

## Route Classification

| Group | Backend Auth | Local Logic | Write-Fail-Fast | Read Fallback | Removal Ready | Blocker |
|-------|:-----------:|:-----------:|:---------------:|:-------------:|:-------------:|---------|
| quests | yes | yes | yes | yes | **no** | read fallback active |
| docs | yes | yes | yes | yes | **no** | read fallback active |
| reports | yes | yes | yes | yes | **no** | read fallback active |
| notes | yes | no | yes | no | yes | — |
| views | yes | no | yes | no | yes | — |
| agents | yes | no | no | no | yes | — |
| automation/runs | yes | no | no | no | yes | — |
| automation/templates | yes | no | no | no | yes | — |
| automation/quests | yes | yes | no | no | **no** | local context writes |
| automation/reports | yes | yes | no | no | **no** | local context writes |
| automation/other | yes | no | no | no | yes | — |
| directive-workspace | yes | no | no | no | yes | — |
| projects | yes | yes | no | no | **no** | local cookie state |
| ops | no | yes | no | no | **no** | pure local services |
| workspace | yes | no | no | no | yes | — |
| code-graph | yes | no | no | no | yes | — |
| context | yes | no | no | no | yes | — |
| workflow | yes | no | no | no | yes | — |

## Blocked groups — required actions

1. **quests, docs, reports** — Remove read fallback after 7-day cutover runway completes (see READ_FALLBACK_CUTOVER_DECISION.md)
2. **automation/quests, automation/reports** — Audit local workspace-context-writer calls; confirm backend handles equivalent writes
3. **projects** — Audit cookie management in active/activate routes; confirm backend session handling covers this
4. **ops** — repo-sources route uses pure local services; requires backend equivalent or intentional retention

## Safe removal order (when unblocked)

1. Pure proxy groups first: agents, automation/runs, automation/templates, automation/other, directive-workspace, workspace, code-graph, context, workflow
2. Write-fail-fast groups after runway: notes, views
3. Read-fallback groups after runway: quests, docs, reports
4. Hybrid groups last: automation/quests, automation/reports, projects, ops
