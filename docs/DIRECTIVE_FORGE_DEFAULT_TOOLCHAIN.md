# Directive Forge Default Toolchain Policy

This document defines the default Directive Forge runtime toolchain that Mission Control should prefer as the active host.

Detailed runtime workflow map:
- `C:/Users/User/.openclaw/workspace/mc-operator/docs/DIRECTIVE_FORGE_TOOL_WORKFLOW_CHEATSHEET.md`

## Default: Use integrated Directive Forge stack automatically

When a project task is requested, default selection should be:

1. **Code understanding**: native Mission Control context pack + local docs/memory
2. **Execution**: OpenClaw + appropriate agent pack (agency-agents / arscontexta / superpowers / software-design-philosophy-skill / skills-manager / impeccable)
3. **UI/browser work**: puppeteer
4. **Verification**: promptfoo
5. **Parallel multi-agent orchestration**: agent-orchestrator (when issue fan-out/lifecycle control is needed)
6. **Parked bounded experiments**: CodeGraphContext only when explicitly reactivated
7. **Unclassified repos**: never default; require explicit admission first
8. **Prototype bootstrapping sprint**: `celtrix` when starting a new agent-first project/system template

Reference registry:
- `C:/Users/User/.openclaw/workspace/directive-workspace/forge/source-packs`

## Included tools

- `directive-workspace/forge/source-packs/puppeteer`
- `directive-workspace/forge/source-packs/promptfoo`
- `directive-workspace/forge/source-packs/agency-agents`
- `directive-workspace/forge/source-packs/arscontexta`
- `directive-workspace/forge/source-packs/agent-orchestrator`
- `directive-workspace/forge/source-packs/superpowers`
- `directive-workspace/forge/source-packs/software-design-philosophy-skill`
- `directive-workspace/forge/source-packs/skills-manager`
- `directive-workspace/forge/source-packs/impeccable`
- `directive-workspace/forge/source-packs/celtrix`

Reference-only / not default:
- `directive-workspace/architecture/03-adopted/2026-03-21-codegraphcontext-wave-02-adopted.md`
- `directive-workspace/forge/follow-up/2026-03-20-autoresearch-cutover-closure.md`
- `directive-workspace/forge/follow-up/2026-03-20-cli-anything-forge-follow-up-record.md`
- `directive-workspace/forge/source-packs/desloppify`
- `directive-workspace/architecture/03-adopted/2026-03-21-hermes-wave-02-adopted.md`

Monitor-held / not scheduled:
- `directive-workspace/discovery/monitor/*`

## Operating rule

For future project work, assume this stack is the default unless explicitly overridden by the user.

## Update cadence

- Check upstream weekly for integrated tools.
- Update local clone/runtime only when:
  - compatibility is confirmed,
  - startup/health scripts still pass,
  - no regressions in Mission Control dispatch paths.
