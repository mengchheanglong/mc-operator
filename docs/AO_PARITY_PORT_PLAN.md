# AO Parity Port Plan (for Mission Control)

## Goal

Adopt the most valuable orchestration behaviors from agent-orchestrator into Mission Control without adding a second control plane or external platform lock-in.

## Principles

- Keep OpenClaw as orchestration/dispatch layer.
- Keep Mission Control as durable system of record.
- Keep n8n as route/schedule engine.
- Reuse existing local-first adapters (puppeteer, promptfoo, agency-agents, arscontexta) and only keep bounded-spike learnings from parked tools (CodeGraphContext, OpenViking).
- Do not import AO wholesale; port patterns selectively.

---

## AO Features Worth Porting

1. **Worktree-per-run isolation**
2. **Reaction loops** (CI failure / changes requested / approved-and-green)
3. **Session supervision** (stuck/crashed detection + restore)
4. **Plugin contract** for runtime / agent / tracker / notifier adapters
5. **Operational commands** parity (`spawn`, `send`, `status`, `restore`, `kill`, `doctor`)

---

## Current Mission Control Baseline

Already in place:
- OpenClaw direct execution path for automations + agents
- n8n dispatch path
- Directive Workspace Forge external-run contract and host adapters
- imported agent packs (agency-agents + arscontexta)
- OpenViking bounded-spike findings (parked; pattern source only)

Gaps vs AO:
- no first-class worktree lifecycle manager in Mission Control
- no standardized event-driven reaction engine for CI/review
- no session health-state model + auto-recovery actions
- no explicit plugin interface docs in Mission Control repo

---

## Implementation Slices

### Slice A — Worktree Orchestration (High value, low ambiguity)

Deliverables:
- New `workspace_runs` model in SQLite
- API:
  - `POST /api/workspaces/runs` (create run + isolated worktree)
  - `POST /api/workspaces/runs/:id/close` (merge/archive/cleanup)
  - `GET /api/workspaces/runs` (status list)
- Runtime actions:
  - create branch naming convention
  - map run -> agent dispatch target
  - cleanup policy for stale runs

Acceptance:
- One task can run in isolated worktree and be cleaned without affecting main branch.

### Slice B — Reaction Engine (CI + review)

Deliverables:
- Event table + processor (`reaction_events`)
- Rules table (`reaction_rules`) with defaults:
  - `ci-failed -> send_to_agent`
  - `changes-requested -> send_to_agent`
  - `approved-and-green -> notify`
- First webhook inputs:
  - GitHub PR review events
  - GitHub check suite/check run events
- Action outputs:
  - enqueue dispatch to matching agent/template
  - create Mission Control report + run linkage

Acceptance:
- CI fail event creates reaction run and sends corrective task to agent automatically.

### Slice C — Session Supervision

Deliverables:
- Session health tracker:
  - states: `healthy`, `stalled`, `failed`, `recovered`
- Stalled detection heuristics:
  - no output for threshold window
  - repeated failures with same signature
- Recovery actions:
  - resend with context
  - re-dispatch to fallback agent
  - raise escalation notification/report

Acceptance:
- Stalled session is auto-flagged and either recovered or escalated with evidence.

### Slice D — Plugin Contract (Mission Control native)

Deliverables:
- `docs/PLUGIN_CONTRACT.md` with interfaces:
  - RuntimeAdapter
  - AgentAdapter
  - TrackerAdapter
  - NotifierAdapter
- Adapter registry in config (`config/tooling.adapters.json`)
- Validation + health checks for adapter registration

Acceptance:
- New adapter can be added without touching core orchestration logic.

### Slice E — Operator UX parity

Deliverables:
- Unified Operations panel:
  - Spawn
  - Send
  - Restore
  - Kill
  - Doctor
- Run Timeline UI:
  - dispatch -> reaction -> follow-up chain
- Error lens:
  - root cause + suggested corrective action

Acceptance:
- Operator can control runs end-to-end without shell commands.

---

## Suggested Build Order

1. Slice A (Worktree orchestration)
2. Slice B (Reaction engine)
3. Slice C (Session supervision)
4. Slice D (Plugin contract)
5. Slice E (UX parity)

---

## Non-Goals

- Running a second dashboard parallel to Mission Control
- Replacing OpenClaw dispatch with AO runtime
- Deep Composio dependency in core orchestration path

---

## Risk Controls

- Each slice behind feature flag
- Keep-or-discard checkpoints after each slice
- Fixed verification checklist before enabling by default
- Artifact and report truncation to prevent noisy payload growth

---

## Immediate Next Step

Start Slice A with a small vertical path:
- one API route
- one worktree run
- one OpenClaw dispatch
- one cleanup flow
- one report
