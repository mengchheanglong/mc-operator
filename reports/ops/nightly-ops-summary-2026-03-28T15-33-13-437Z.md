# Nightly Ops Summary

- Generated At: 2026-03-28T15:33:13.437Z
- Bundle Generated At: 2026-03-28T15:30:02.594Z
- Overall: FAIL
- Failed Count: 4
- Duration (ms): 190367
- Step Order Version: 2

| Step | Status | Exit | Duration ms | Start offset ms | End offset ms |
| --- | --- | ---: | ---: | ---: | ---: |
| repo_sources_nightly | PASS | 0 | 10305 | 0 | 10305 |
| canary_nightly | FAIL | 1 | 7565 | 10305 | 17870 |
| workspace_health_nightly | FAIL | 1 | 90567 | 17870 | 108437 |
| orchestrator_nightly | FAIL | 1 | 81135 | 108437 | 189572 |
| ops_health_snapshot | FAIL | 1 | 792 | 189572 | 190364 |

## Raw Command Summary
- repo_sources_nightly: `npm run ops:repo-sources:nightly`
- canary_nightly: `npm run canary:nightly`
- workspace_health_nightly: `npm run ops:workspace-health-nightly`
- orchestrator_nightly: `npm run ops:orchestrator-nightly`
- ops_health_snapshot: `npm run ops:health:snapshot`

