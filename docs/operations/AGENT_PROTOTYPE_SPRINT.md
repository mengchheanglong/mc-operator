# Agent Prototype Sprint (OpenClaw + Mission Control)

## Purpose

Use a short sprint to prototype the **execution system** (agents, guardrails, run lifecycle), not just code scaffolding.

## Timebox

- Target: 1-3 days max
- Hard stop when exit criteria pass
- Max setup tasks: 12

## Scope

1. One mission only (single end-to-end workflow)
2. Minimum viable agent pipeline
3. Strict guardrails (timeout/retry/rollback/verification)
4. Repeated dispatch reliability check
5. Freeze template and start feature work

## Celtrix usage

Use Celtrix as a **prototype bootstrapping accelerator**:
- generate/standardize structure and setup scripts
- define agent-run workflow checkpoints
- avoid over-design beyond first runnable flow

Do not make Celtrix a long-lived runtime dependency unless ROI is proven by repeated projects.

## Exit criteria (must all pass)

- `dev` starts successfully
- `test` and `typecheck` pass
- one run-scoped dispatch path succeeds
- one `desloppify-prototype` run-scoped tool path succeeds
- legacy `tooling-audit` calls are accepted only as a deprecated compatibility alias
- readiness + canary checks pass
- first tiny feature task starts immediately after setup

## Suggested command gate

```powershell
npm test
npm run typecheck
npx tsx scripts/slice-a-live-dispatch-validation.ts
npx tsx scripts/slice-e-run-desloppify-prototype.ts
npm run check:orchestrator-readiness
npm run canary:nightly
```

## Metrics to track

- Dispatch success rate
- Timeout/failover rate
- Median run duration
- Number of manual interventions required
- Verification pass rate

## Anti-patterns

- Expanding setup scope after gates already pass
- Building abstractions before first successful end-to-end run
- Treating setup artifacts as product features
