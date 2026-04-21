# Phase 2 Finish Checklist

Last updated: 2026-04-21

Use this checklist to finish Mission Control beyond the local-first release bar.

Phase 1 is complete. This plan is for polish, hardening, and cleanup only.

## Finish Line Definition

Pick one target before starting implementation:

- `Operational finish`: stronger confidence and cleanup, without major product shape changes.
- `Product finish`: operational finish plus promotion or explicit internalization of secondary surfaces.

Do not mix both targets in the same sprint unless capacity is confirmed.

## Must Fix (Phase 2 Exit Blockers)

1. Backend-owned project activation

- Move active project selection from frontend-local behavior to backend-owned state.
- Persist active project in backend storage with explicit read and update API behavior.
- Ensure write operations consistently resolve project scope via backend rules.
- Preserve explicit `projectId` overrides where required for batch or admin workflows.
- Add regression tests for activation persistence and scope correctness.

Exit criteria:

- changing active project survives reload and process restart
- backend responses expose current active project state consistently
- product-scoped writes are correct when `projectId` is omitted
- existing regression and product gate checks stay green

2. Decide and enforce status of Code Graph and Context Export

- Choose exactly one path:
- `Path A (first-class)`: visible navigation, product copy, and basic interaction tests.
- `Path B (internal-only)`: move to clearly internal ops surface and document as non-core.
- Remove ambiguous middle state where features exist but product intent is unclear.

Exit criteria:

- navigation and docs match the chosen path
- smoke and route coverage reflect intended visibility
- no contradictory language in README, release docs, or ops docs

3. Interaction-level critical flow coverage

- Add deeper interaction tests (not route-only smoke) for:
- quests create/edit/complete flow
- docs create/edit/delete flow
- automation run launch and close flow
- agents dispatch happy path and failure state
- Keep isolated smoke as a fast gate; add a separate deeper suite for critical flows.

Exit criteria:

- critical flow suite is runnable in CI/local with one command
- flaky test policy is documented and enforced
- failures point to actionable logs or artifacts

4. Clean-machine environment hardening

- Validate setup on a fresh Windows machine profile with no cached state.
- Verify install, dev startup, backend startup, and product gate with only documented steps.
- Close gaps in `.env.example`, path assumptions, and writable directory expectations.

Exit criteria:

- fresh-machine runbook succeeds without ad-hoc fixes
- all required environment assumptions are documented once
- known platform-specific caveats are explicit and tested

## Should Fix (High Value Polish)

1. UX consistency on secondary surfaces

- Align empty states, error states, loading states, and action wording across:
- projects
- views
- agents
- automation
- directive
- ops

2. Docs and ops sprawl reduction

- Archive or remove stale historical docs that no longer map to active product behavior.
- Keep one canonical entry doc for release status and one for active backlog.
- Reduce duplicate check descriptions across docs.

3. Product language cleanup

- Standardize user-facing terms for project scope, runs, tools, and directives.
- Remove internal implementation terms from core operator-facing pages.

## Ignore For Now (Explicit Non-Goals)

- broad architecture rewrites
- replacing Nest, Next.js, or SQLite for this phase
- net-new major feature families unrelated to current operator surfaces
- speculative optimization work without measured bottlenecks

## Recommended Execution Order

1. lock finish-line target (`Operational finish` or `Product finish`)
2. complete backend-owned project activation
3. decide and apply Code Graph/Context Export visibility path
4. implement critical interaction test suite
5. run fresh-machine hardening pass
6. perform docs and UX cleanup sweep

## Suggested Tracking Labels

Use these labels in issues or a project board:

- `phase2-must`
- `phase2-should`
- `phase2-ignore`
- `phase2-risk`
- `phase2-flaky-test`

## Definition of Done (Phase 2)

Phase 2 is done when:

- all Must Fix items satisfy their exit criteria
- no open P0/P1 issues remain in core operator workflows
- release and completion docs describe the same intended product surface
- verification commands are stable on a clean machine
