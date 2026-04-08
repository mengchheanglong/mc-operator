# Directive Workspace V0 Foundation

Last updated: 2026-03-19

## V0 scope lock

- Supported input type: `github-repo`
- Workflow family: `external-capability-adoption`
- Primary metric: `decision_lead_time_hours <= 72`

Workflow sentence:

Evaluate an external GitHub repo or tool pack for adoption into the workspace, run one bounded experiment, and record an evidence-backed decision with rollback notes.

## Canonical clarification

Directive Forge and Directive Architecture are not the same job:

- `Directive Forge`
  - callable-adoption lane
  - purpose: move useful external ROI into the user's workflow as callable host capability
  - current host: Mission Control

- `Directive Architecture`
  - framework-improvement lane
  - purpose: improve Directive Workspace itself so it gets better at consuming and integrating external capability sources
  - current exploration surface: `directive-workspace/architecture`

- `Directive Discovery`
  - planned future discovery lane
  - purpose: find useful projects, concepts, papers, and products that can improve v0 and v1
  - current state: planned after v1, not active yet

Rule:
- Directive Forge can end in callable host capability.
- Directive Architecture should end in a better Directive Workspace framework, not callable runtime delivery. Any runtime outcome from v1 exploration requires an explicit separate decision and transfer to the Directive Forge lane.
- Directive Discovery should end in better candidate intake patterns, not callable runtime delivery. Discovery findings must be triaged separately before v0/v1 integration.

## Architecture decision

Directive Workspace is a standalone feature boundary, and Directive Forge is currently hosted inside Mission Control.

Mission Control is the first host, not the product definition.

The current host implementation reuses existing execution infrastructure:

- `workspace_runs`: bounded experiment container
- `workspace_run_dispatches`: execution and tool telemetry
- `reports`: evidence, decision, and audit artifacts

Directive Workspace adds first-class lifecycle records on top:

- `directive_capabilities`
- `directive_experiments`
- `directive_evaluations`
- `directive_decisions`
- `directive_integrations`

## V0 state model

Legacy capability status (kept for compatibility):

- `intake`
- `analyzed`
- `experimenting`
- `evaluated`
- `decided`
- `integrated`

Operator-facing label rule:
- do not present `integrated` as the main UI term
- use `framework-adopted` when describing decision outcome
- use `runtime-callable` when describing completed host delivery

Explicit framework/runtime status (authoritative):

- `framework_status`: `intake | analyzed | experimenting | evaluated | decided`
- `runtime_status`: `none | planned | implementing | callable | parked | removed`

Interpretation:

- internal `integrated` means "approved and host-runtime-callable path completed".
- Framework progress is tracked by `framework_status`.
- Runtime delivery is tracked by `runtime_status`.

Decision outcomes:

- `adopt`
- `reject`
- `defer`
- `monitor`

Integration status:

- `planned`
- `active`
- `parked`
- `removed`

## Promotion contract (required for `decision=adopt`)

Every adopt decision must persist:

- `integration_mode`: `reimplement | adapt | wrap`
- `target_runtime_surface`
- `owner`
- `due_at`
- `required_gates`
- `rollback_plan`
- `integration_proof` (execution + artifact reference)

This prevents decision/runtime ambiguity and ensures callable delivery ownership.

## Lead-time metrics

- `decision_lead_time_hours`: intake -> decision
- `adopt_to_callable_lead_time_hours`: intake -> runtime callable

## Dashboard operating view (Phase 2)

Directive UI is a framework control plane, not a generic task board. It should make these visible:

- lane boundary: Directive Forge callable-adoption lane vs Directive Architecture framework-improvement lane vs Mission Control runtime host lane
- framework/runtime status per capability
- promotion-contract readiness (`owner`, `due_at`, `required_gates`, `rollback_plan`, proof path)
- lead-time signals (`decision_lead_time_hours`, `adopt_to_callable_lead_time_hours`)
- stale/overdue adopted items before callable runtime status

Dashboard view modes:
- `Directive Runtime`: registry/lifecycle/promotion metrics from directive tables.
- `Directive Architecture`: filesystem-backed exploration pipeline overview (`00-intake` -> `04-deferred-or-rejected`) with current queue state.

## Why this shape

- Existing tool-admission logic already proves there is demand for capability evaluation.
- Existing run/report infrastructure already handles execution and evidence storage.
- The missing piece was a first-class lifecycle domain instead of scattered scripts and report files.

## V0 API surface

- `GET/POST /api/directive-workspace/capabilities`
- `GET /api/directive-workspace/capabilities/[id]`
- `POST /api/directive-workspace/capabilities/[id]/analysis`
- `POST /api/directive-workspace/capabilities/[id]/experiments`
- `POST /api/directive-workspace/capabilities/[id]/evaluations`
- `POST /api/directive-workspace/capabilities/[id]/decision`
- `GET /api/directive-workspace/registry`
- `GET /api/directive-workspace/architecture/overview`

## Not in v0

- multi-input support
- broad autonomous discovery
- final UI polish
- generalized tool marketplace abstractions
- uncontrolled adoption without explicit decision
- Directive Architecture framework-improvement work itself
- Directive Discovery source-finding work
