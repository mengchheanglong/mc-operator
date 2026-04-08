# Codex-First Execution Model

Last updated: 2026-03-17

## Goal

Keep Mission Control and OpenClaw as orchestration/observability layers while making Codex the default implementation lane for coding tasks.

## Lane split

- Codex lane (engineering): file edits, refactors, debugging, test/build loops, implementation details.
- OpenClaw lane (control room): planning, orchestration, status tracking, tool routing, runtime monitoring, delivery/reporting.

## Policy

- Default mode: `codex-first`
- OpenClaw fallback remains available for all task types when Agent-Orchestrator is unavailable.
- Coding tasks are marked as Codex-preferred, but not hard-blocked from OpenClaw execution.
- No scope limit: OpenClaw execution is allowed for coding work of any size when explicitly chosen.
- Non-coding tasks remain natural OpenClaw control-room work.
- `allowOpenClawFallback` remains accepted for compatibility, but fallback is no longer restricted by this flag.

## OpenClaw control roles

OpenClaw role is inferred from task intent and persisted in dispatch reports.

- `workflow-architect`: planning/scope/acceptance design.
- `task-orchestrator`: default coordination role across runs/agents.
- `ops-monitor`: canary/health/reliability/log triage role.
- `integration-coordinator`: tool/adapter/contract routing role.

## Runtime controls

- Env var: `MISSION_CONTROL_EXECUTION_MODE`
  - `codex-first` (default)
  - `hybrid`
  - `openclaw-first`

## Dispatch behavior (`/api/agents/[id]/dispatch`)

In `codex-first` mode:

1. If backend is `agent-orchestrator`, dispatch attempts AO first.
2. If AO fails with known runtime-unavailable conditions:
   - OpenClaw fallback still executes for both coding and non-coding tasks
   - coding tasks include a non-blocking "Codex-preferred" hint in fallback brief/metadata
3. Dispatch metadata persists execution mode + inferred OpenClaw role for observability.

## Guardrail check

Run before integration or release work:

```bash
npm run check:codex-first-workflow
```
