# Nightly Ops Summary

- Generated At: 2026-04-06T15:33:43.343Z
- Bundle Generated At: 2026-04-06T15:30:02.493Z
- Overall: FAIL
- Failed Count: 4
- Duration (ms): 220364
- Step Order Version: 2

| Step | Status | Exit | Duration ms | Start offset ms | End offset ms |
| --- | --- | ---: | ---: | ---: | ---: |
| repo_sources_nightly | PASS | 0 | 11041 | 0 | 11041 |
| canary_nightly | FAIL | 1 | 7467 | 11041 | 18508 |
| workspace_health_nightly | FAIL | 1 | 88083 | 18508 | 106591 |
| orchestrator_nightly | FAIL | 1 | 113231 | 106591 | 219822 |
| ops_health_snapshot | FAIL | 1 | 539 | 219822 | 220361 |

## Raw Command Summary
- repo_sources_nightly: `npm run ops:repo-sources:nightly`
- canary_nightly: `npm run canary:nightly`
- workspace_health_nightly: `npm run ops:workspace-health-nightly`
- orchestrator_nightly: `npm run ops:orchestrator-nightly`
- ops_health_snapshot: `npm run ops:health:snapshot`

