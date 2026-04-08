# Nightly Ops Summary

- Generated At: 2026-04-04T15:33:09.688Z
- Bundle Generated At: 2026-04-04T15:30:02.872Z
- Overall: FAIL
- Failed Count: 4
- Duration (ms): 186407
- Step Order Version: 2

| Step | Status | Exit | Duration ms | Start offset ms | End offset ms |
| --- | --- | ---: | ---: | ---: | ---: |
| repo_sources_nightly | PASS | 0 | 10226 | 0 | 10226 |
| canary_nightly | FAIL | 1 | 7881 | 10226 | 18107 |
| workspace_health_nightly | FAIL | 1 | 93351 | 18107 | 111458 |
| orchestrator_nightly | FAIL | 1 | 74417 | 111458 | 185875 |
| ops_health_snapshot | FAIL | 1 | 527 | 185875 | 186402 |

## Raw Command Summary
- repo_sources_nightly: `npm run ops:repo-sources:nightly`
- canary_nightly: `npm run canary:nightly`
- workspace_health_nightly: `npm run ops:workspace-health-nightly`
- orchestrator_nightly: `npm run ops:orchestrator-nightly`
- ops_health_snapshot: `npm run ops:health:snapshot`

