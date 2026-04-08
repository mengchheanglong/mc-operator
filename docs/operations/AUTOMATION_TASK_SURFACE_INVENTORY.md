# Automation Task Surface Inventory

## Scope
This inventory tracks the Mission Control automation surfaces tied to:
- run-scoped automation execution
- orchestration readiness/canary/nightly health
- directive-workspace lifecycle automation
- dashboard/operator automation visibility

## API Routes
- `src/app/api/automation/templates/**`
- `src/app/api/automation/runs/**`
- `src/app/api/automation/quests/route.ts`
- `src/app/api/automation/reports/route.ts`
- `src/app/api/automation/session-brief/route.ts`
- `src/app/api/automation/openclaw/health/route.ts`
- `src/app/api/automation/n8n/status/route.ts`
- `src/app/api/agents/[id]/dispatch/route.ts`
- `src/app/api/ops/nightly/route.ts`
- `src/app/api/directive-workspace/**`

## Core Services
- `src/server/services/automation-executor-service.ts`
- `src/server/services/automation-template-evaluator.ts`
- `src/server/services/agent-orchestrator-service.ts`
- `src/server/services/run-scoped-tools-core.ts`
- `src/server/services/run-scoped-tools-service.ts`
- `src/server/services/run-scoped-tooling-audit-service.ts` (legacy compatibility alias path)
- `src/server/services/run-scoped-desloppify-core.ts`
- `src/server/services/run-scoped-desloppify-service.ts`
- `src/server/services/run-scoped-agency-agents-core.ts`
- `src/server/services/run-scoped-agency-agents-service.ts`
- `src/server/services/nightly-ops-bundle-core.ts`
- `src/server/services/nightly-ops-status-service.ts`
- `src/server/services/nightly-hotspot-guardrails-service.ts`
- `src/server/services/nightly-canary-guardrails-service.ts`
- `src/server/services/ops-health-service.ts`
- `src/server/services/reliability-ops-core.ts`
- `src/server/services/reliability-ops-service.ts`
- `src/server/services/repo-sources-config-service.ts`
- `src/server/services/repo-sources-ops-service.ts`
- `src/server/services/repo-sources-report-service.ts`
- `src/server/services/task-quality-guardrails.ts`
- `src/server/services/telegram-send-guard.ts`

## Operator UI
- `src/app/dashboard/automations/WorkspaceRunsPanel.tsx`
- `src/app/dashboard/directive-workspace/page.tsx`
- `src/app/dashboard/RepoSourcesPanelClient.tsx`

## Runtime Scripts (Automation/Ops)
- `scripts/check-*.ts` for readiness, canary, nightly, ops stack, directive checks, workflow guardrails
- `scripts/run-nightly-ops-bundle.ts`
- `scripts/run-reliability-nightly-canary.ts`
- `scripts/run-workspace-global-health-nightly.ts`
- `scripts/run-orchestrator-nightly-ops.ts`
- `scripts/run-nightly-step-hotspots-report.ts`
- `scripts/run-nightly-step-hotspots-followup.ts`
- `scripts/render-nightly-ops-summary.ts`
- `scripts/render-nightly-step-hotspots-summary.ts`
- `scripts/render-nightly-step-hotspots-alerts.ts`
- `scripts/slice-a-live-dispatch-validation.ts`
- `scripts/slice-d-run-tooling-audit.ts` (legacy compatibility slice)
- `scripts/slice-e-run-desloppify-prototype.ts` (canonical path slice)
- `scripts/slice-f-run-agency-agents.ts`
- `scripts/seed-directive-workspace-candidates.ts`
- `scripts/run-directive-candidate-lifecycle.ts`
- `scripts/setup-nightly-ops-task.ps1`

## Runtime Tests
- `tests/runtime/run-scoped-tools-service.test.ts`
- `tests/runtime/run-scoped-desloppify-core.test.ts`
- `tests/runtime/run-scoped-agency-agents-core.test.ts`
- `tests/runtime/directive-workspace-v0.test.ts`
- `tests/runtime/nightly-ops-bundle-core.test.ts`
- `tests/runtime/nightly-ops-status-service.test.ts`
- `tests/runtime/ops-health-service.test.ts`
- `tests/runtime/repo-sources-config-service.test.ts`
- `tests/runtime/repo-sources-ops-service.test.ts`
- `tests/runtime/repo-sources-report-service.test.ts`
- `tests/runtime/task-quality-guardrails.test.ts`
- `tests/runtime/telegram-send-guard.test.ts`
- `tests/runtime/workspace-run-close-policy.test.ts`

## Reports / Artifacts
- `reports/ops/canary-*.json`
- `reports/ops/canary-latest.json`
- `reports/ops/orchestrator-nightly-*.json`
- `reports/ops/orchestrator-reliability-*.json`
- `reports/ops/nightly-ops-summary-*.md`
- `reports/ops/nightly-step-hotspots-*.json`
- `reports/ops/nightly-step-hotspots-summary-*.md`
- `reports/ops/nightly-step-hotspots-alerts-*.json`
- `reports/ops/nightly-step-hotspots-followup-*.json`
- `reports/ops/directive-integration-proof-*.md`
- `reports/ops/directive-lifecycle-proof-*.md`

## Cleanup Targets (Current)
- Keep `desloppify-prototype` as canonical run-scoped tooling route.
- Keep `tooling-audit` as compatibility alias only, with explicit deprecation metadata.
- Remove stale references that imply `tooling-audit` is primary.
- Keep tests proving alias behavior and canonical mapping.

## Immediate Next Checks
- Run `npm run run:desloppify-prototype` when validating the canonical path.
- Run `npm run run:tooling-audit:compat` when validating legacy compatibility behavior.
- Run `npm run check:workflow-guardrails` after any automation-surface edit.
- Prefer updating this inventory when new automation routes, scripts, or reports land.
