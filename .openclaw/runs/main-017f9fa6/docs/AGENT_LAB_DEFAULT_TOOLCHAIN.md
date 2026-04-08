# Agent Lab Default Toolchain Policy

This document defines what Mission Control should default to when working on a project.

## Default: Use integrated Agent Lab stack automatically

When a project task is requested, default selection should be:

1. **Code understanding**: CodeGraphContext
2. **Execution**: OpenClaw + appropriate agent pack (agency-agents / arscontexta)
3. **UI/browser work**: puppeteer
4. **Verification**: promptfoo
5. **Parallel multi-agent orchestration**: agent-orchestrator (when issue fan-out/lifecycle control is needed)
6. **Design/frontend skill pack**: impeccable (when relevant)
7. **Memory experiment path**: OpenViking (pilot)

Reference registry:
- `C:/Users/User/.openclaw/workspace/agent-lab/orchestration/CAPABILITY_REGISTRY.json`

## Included tools

- `tooling/CodeGraphContext`
- `tooling/puppeteer`
- `tooling/promptfoo`
- `tooling/agency-agents`
- `tooling/arscontexta`
- `tooling/agent-orchestrator`
- `tooling/impeccable`
- `services/OpenViking` (pilot)

## Excluded from core orchestration

- `research/MiroFish`
- `research/heretic`

## Operating rule

For future project work, assume this stack is the default unless explicitly overridden by the user.

## Update cadence

- Check upstream weekly for integrated tools.
- Update local clone/runtime only when:
  - compatibility is confirmed,
  - startup/health scripts still pass,
  - no regressions in Mission Control dispatch paths.
