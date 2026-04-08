# Nightly Ops Summary

- Generated At: 2026-04-03T22:37:14.519Z
- Bundle Generated At: 2026-04-03T22:23:45.300Z
- Overall: FAIL
- Failed Count: 4
- Duration (ms): 808737
- Step Order Version: 2

| Step | Status | Exit | Duration ms | Start offset ms | End offset ms |
| --- | --- | ---: | ---: | ---: | ---: |
| repo_sources_nightly | PASS | 0 | 21895 | 0 | 21895 |
| canary_nightly | FAIL | 1 | 22598 | 21895 | 44493 |
| workspace_health_nightly | FAIL | 1 | 399486 | 44493 | 443979 |
| orchestrator_nightly | FAIL | 1 | 363761 | 443979 | 807740 |
| ops_health_snapshot | FAIL | 1 | 976 | 807740 | 808716 |

## Raw Command Summary
- repo_sources_nightly: `npm run ops:repo-sources:nightly`
- canary_nightly: `npm run canary:nightly`
- workspace_health_nightly: `npm run ops:workspace-health-nightly`
- orchestrator_nightly: `npm run ops:orchestrator-nightly`
- ops_health_snapshot: `npm run ops:health:snapshot`

